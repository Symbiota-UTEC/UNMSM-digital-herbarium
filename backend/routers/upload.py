# backend/routers/upload.py
from __future__ import annotations

import csv
import io
from typing import Any, Dict, List, Optional, Tuple, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select, exists
from sqlalchemy.orm import Session
from datetime import datetime

from backend.config.database import get_db
from backend.auth.jwt import get_current_user
from backend.models.models import (
    User,
    Collection,
    CollectionPermission,
    Occurrence,
    Event,
    Location,
    Taxon,
    ResourceRelationship,
)

from backend.utils.dwc import (
    DWC_HEADER_RE,
    ALLOWED_FIELDS,
)

router = APIRouter(
    prefix="/upload",
    tags=["Files"],
)

# Claves “natural keys” muy simples para reducir duplicados en una carga
def _taxon_key(d: Dict[str, Any]) -> Tuple:
    return (
        d.get("scientificName") or "",
        d.get("scientificNameAuthorship") or "",
        d.get("family") or "",
        d.get("genus") or "",
        d.get("specificEpithet") or "",
        d.get("infraspecificEpithet") or "",
        d.get("taxonRank") or "",
        d.get("acceptedNameUsage") or "",
    )

def _location_key(d: Dict[str, Any]) -> Tuple:
    return (
        d.get("stateProvince") or "",
        d.get("county") or "",
        d.get("municipality") or "",
        d.get("locality") or "",
        d.get("decimalLatitude") or "",
        d.get("decimalLongitude") or "",
        d.get("minimumElevationInMeters") or "",
        d.get("maximumElevationInMeters") or "",
    )

def _event_key(d: Dict[str, Any], location_id: Optional[int]) -> Tuple:
    return (
        d.get("eventDate") or "",
        d.get("year") or "",
        d.get("month") or "",
        d.get("day") or "",
        d.get("fieldNumber") or "",
        location_id or 0,
    )


def _strict_parse_headers(headers: List[str]) -> Dict[Tuple[str, str], int]:
    """
    Valida que TODOS los headers cumplan dwc:Entity:field y que field esté permitido.
    Devuelve un mapa {(Entity, field) -> index}.
    Si hay cualquier columna inválida o field no permitido, lanza ValueError.
    """
    errors: List[str] = []
    mapping: Dict[Tuple[str, str], int] = {}

    for idx, h in enumerate(headers):
        m = DWC_HEADER_RE.match(h.strip())
        if not m:
            errors.append(f"Header inválido: '{h}' (se requiere 'dwc:Entity:field')")
            continue
        entity, field = m.group(1), m.group(2)
        if entity not in ALLOWED_FIELDS:
            errors.append(f"Entity no soportada: '{entity}' en header '{h}'")
            continue
        if field not in ALLOWED_FIELDS[entity]:
            errors.append(f"Field no permitido para {entity}: '{field}' (header '{h}')")
            continue
        mapping[(entity, field)] = idx

    if errors:
        # Señala todas las columnas problemáticas de una vez
        raise ValueError(
            "Error en headers del CSV:\n- " + "\n- ".join(errors)
        )

    return mapping


def _clean_value(v: str) -> Optional[str]:
    v = (v or "").strip()
    return v if v != "" else None


def _to_int(v: Optional[str]) -> Optional[int]:
    if v is None:
        return None
    try:
        return int(float(v))
    except Exception:
        return None


def _to_float(v: Optional[str]) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


def _to_dt(v: Optional[str]) -> Optional[datetime]:
    if v is None:
        return None
    # Acepta ISO-8601 u otras fechas “YYYY-MM-DD”
    try:
        # Intento ISO con tiempo
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except Exception:
        pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(v, fmt)
        except Exception:
            continue
    return None

# =========================
# Helpers de autorización
# =========================

def _user_can_edit_collection(db: Session, user: User, collection: Collection) -> bool:
    """
    Regla de edición:
    - superuser: acceso
    - permiso explícito con rol editor/owner: acceso
    - admin de institución y misma institución: acceso
    """
    if user.is_superuser:
        return True

    perm_exists = db.scalar(
        select(
            exists().where(
                (CollectionPermission.collection_id == collection.id)
                & (CollectionPermission.user_id == user.id)
                & (CollectionPermission.role.in_(["editor", "owner"]))
            )
        )
    )
    if perm_exists:
        return True

    if user.is_institution_admin and collection.institution_id and user.institution_id:
        if int(collection.institution_id) == int(user.institution_id):
            return True

    return False


# =========================
# Endpoint: Upload DWC CSV
# =========================

@router.post(
    "/dwc-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Sube un CSV DwC estricto y lo inserta a una colección",
)
def upload_dwc_csv(
    collection_id: int = Form(..., description="ID de la colección destino"),
    file: UploadFile = File(..., description="Archivo CSV (DwC headers: dwc:Entity:field)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    - Valida extensión y contenido CSV
    - Valida headers estrictos 'dwc:Entity:field'
    - Inserta Location, Event, Taxon deduplicando por claves simples (caches de corrida)
    - Inserta Occurrence y ResourceRelationship (duplicateOf) cuando corresponda
    - Controla permisos de edición sobre la colección
    """
    # -------- Validaciones básicas de archivo --------
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe tener extensión .csv",
        )

    # -------- Colección + permisos --------
    collection = db.scalar(select(Collection).where(Collection.id == collection_id))
    if not collection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    if not _user_can_edit_collection(db, current_user, collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para cargar en esta colección")

    # -------- Leer CSV a memoria --------
    try:
        raw = file.file.read()
    finally:
        file.file.close()
    try:
        # Soporta BOM utf-8
        text = raw.decode("utf-8-sig")
    except Exception:
        # Intento de fallback a latin-1 si fuera necesario
        try:
            text = raw.decode("latin-1")
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se pudo decodificar el CSV (utf-8/latin-1)")

    reader = csv.reader(io.StringIO(text))
    headers = next(reader, None)
    if headers is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV vacío (sin headers)")

    # -------- Validar headers estrictos --------
    try:
        colmap = _strict_parse_headers(headers)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    # -------- Caches de corrida y stats --------
    taxon_cache: Dict[Tuple, Taxon] = {}
    location_cache: Dict[Tuple, Location] = {}
    event_cache: Dict[Tuple, Event] = {}

    stats = {
        "rows": 0,
        "occurrences_inserted": 0,
        "events_inserted": 0,
        "locations_inserted": 0,
        "taxa_inserted": 0,
        "rels_inserted": 0,
    }

    buffer: List[Occurrence] = []
    BATCH_SIZE = 200

    # -------- Loop principal --------
    try:
        for row in reader:
            stats["rows"] += 1

            # Extract por entidad
            occ_d: Dict[str, Any] = {}
            evt_d: Dict[str, Any] = {}
            loc_d: Dict[str, Any] = {}
            tax_d: Dict[str, Any] = {}
            rel_d: Dict[str, Any] = {}

            for (entity, field), idx in colmap.items():
                val = _clean_value(row[idx] if idx < len(row) else "")
                if val is None:
                    continue

                if entity == "Occurrence":
                    if field in {"individualCount"}:
                        occ_d[field] = _to_int(val)
                    elif field in {"modified"}:
                        occ_d[field] = _to_dt(val) or None
                    else:
                        occ_d[field] = val

                elif entity == "Event":
                    if field in {"year", "month", "day"}:
                        evt_d[field] = _to_int(val)
                    else:
                        evt_d[field] = val

                elif entity == "Location":
                    if field in {
                        "decimalLatitude",
                        "decimalLongitude",
                        "coordinateUncertaintyInMeters",
                        "coordinatePrecision",
                        "minimumElevationInMeters",
                        "maximumElevationInMeters",
                    }:
                        loc_d[field] = _to_float(val)
                    else:
                        loc_d[field] = val

                elif entity == "Taxon":
                    tax_d[field] = val

                elif entity == "ResourceRelationship":
                    rel_d[field] = val

            # ---- Crear/reciclar Location ----
            location_id: Optional[int] = None
            location_obj: Optional[Location] = None
            if loc_d:
                lkey = _location_key(loc_d)
                location_obj = location_cache.get(lkey)
                if not location_obj:
                    location_obj = Location(**loc_d)
                    db.add(location_obj)
                    db.flush()
                    location_cache[lkey] = location_obj
                    stats["locations_inserted"] += 1
                location_id = location_obj.id

            # ---- Crear/reciclar Event ----
            event_id: Optional[int] = None
            event_obj: Optional[Event] = None
            if evt_d:
                ekey = _event_key(evt_d, location_id)
                event_obj = event_cache.get(ekey)
                if not event_obj:
                    if location_id:
                        evt_d["location_id"] = location_id
                    event_obj = Event(**evt_d)
                    db.add(event_obj)
                    db.flush()
                    event_cache[ekey] = event_obj
                    stats["events_inserted"] += 1
                event_id = event_obj.id

            # ---- Crear/reciclar Taxon ----
            taxon_id: Optional[int] = None
            taxon_obj: Optional[Taxon] = None
            if tax_d:
                tkey = _taxon_key(tax_d)
                taxon_obj = taxon_cache.get(tkey)
                if not taxon_obj:
                    taxon_obj = Taxon(**tax_d)
                    db.add(taxon_obj)
                    db.flush()
                    taxon_cache[tkey] = taxon_obj
                    stats["taxa_inserted"] += 1
                taxon_id = taxon_obj.id

            # ---- Crear Occurrence ----
            occ = Occurrence(**occ_d)
            occ.collection_id = collection_id
            if event_id:
                occ.event_id = event_id
            if location_id:
                occ.location_id = location_id
            if taxon_id:
                occ.taxon_id = taxon_id
            if not occ.modified:
                from datetime import datetime as _dt
                occ.modified = _dt.utcnow()

            db.add(occ)
            buffer.append(occ)

            # ---- ResourceRelationship (duplicateOf) ----
            r_rel_val = rel_d.get("relatedResourceID")
            if r_rel_val:
                resource_id_str = occ.occurrenceID or occ.catalogNumber or None
                rel_obj = ResourceRelationship(
                    resourceID=resource_id_str,
                    relatedResourceID=r_rel_val,
                    relationshipOfResource="duplicateOf",
                    occurrence=occ,
                )
                db.add(rel_obj)
                stats["rels_inserted"] += 1

            # ---- Commit por lotes ----
            if len(buffer) >= BATCH_SIZE:
                db.commit()
                stats["occurrences_inserted"] += len(buffer)
                buffer.clear()

        # flush final
        if buffer:
            db.commit()
            stats["occurrences_inserted"] += len(buffer)
            buffer.clear()

    except HTTPException:
        # deja pasar HTTPException tal cual
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error procesando CSV: {e}") from e

    return {
        "status": "ok",
        "collection_id": collection_id,
        **stats,
    }
