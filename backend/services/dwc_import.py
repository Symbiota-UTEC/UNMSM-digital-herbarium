# backend/services/dwc_import.py
from __future__ import annotations
from uuid import UUID

import csv
import io
import json

from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from backend.models.models import User, Collection, Occurrence, Taxon, Identifier, Identification
from backend.services.collection_permissions import user_can_edit_collection
from backend.utils.dwc import DWC_HEADER_RE, ALLOWED_FIELDS


# ----------------------------
# Helpers claves / parsing
# ----------------------------

def _taxon_key(scientific_name: str, authorship: Optional[str]) -> Tuple[str, str]:
    """Clave simple para Taxon dentro de ESTA carga."""
    return (scientific_name or "", authorship or "")


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

        allowed = ALLOWED_FIELDS.get(entity)
        if not allowed:
            errors.append(f"Entity no soportada: '{entity}' en header '{h}'")
            continue

        if field not in allowed:
            errors.append(
                f"Field no permitido para {entity}: '{field}' (header '{h}')"
            )
            continue

        mapping[(entity, field)] = idx

    if errors:
        # Señala todas las columnas problemáticas de una vez
        raise ValueError("Error en headers del CSV:\n- " + "\n- ".join(errors))

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


def _to_json_value(v: Optional[str]) -> Any:
    """
    Intenta parsear JSON. Si falla, retorna el string original (válido como JSON string).
    Preferimos objetos/dicts para dynamicProperties, pero aceptamos cualquier JSON válido.
    """
    if v is None:
        return None
    try:
        return json.loads(v)
    except Exception:
        # Guarda la cadena tal cual; SQLAlchemy JSON la serializa como string JSON.
        return v


def _to_bool(v: Optional[str]) -> Optional[bool]:
    if v is None:
        return None
    vv = v.strip().lower()
    if vv in {"1", "true", "t", "yes", "y", "si", "sí"}:
        return True
    if vv in {"0", "false", "f", "no", "n"}:
        return False
    return None


def _split_list(v: Optional[str]) -> List[str]:
    """Separa por comas y limpia espacios; ignora entradas vacías."""
    if not v:
        return []
    return [part.strip() for part in v.split(",") if part.strip()]


def _resolve_unique_taxon_for_identification(
    db: Session,
    scientific_name: str,
    authorship: Optional[str],
) -> Optional[Taxon]:
    """
    Intenta resolver un Taxon ÚNICO para una identificación, siguiendo esta lógica:

    1. Buscar por scientificName + scientificNameAuthorship (cuando viene autoría),
       o scientificName + (authorship IS NULL/'') cuando no viene autoría.
    2. Si no hay resultados, reintentar ignorando la autoría (solo scientificName).
    3. Si hay exactamente 1 candidato en cualquier paso, se usa ese.
    4. Si hay múltiples, se intenta refinar:
        - Priorizar isCurrent = True (si hay exactamente 1).
        - Luego taxonomicStatus = "Accepted" y nomenclaturalStatus = "Valid" (si hay 1).
        - Luego aquellos con tplID no nulo/vacío (si hay 1).
    5. Si sigue habiendo múltiples o ninguno, devuelve None (no se asigna taxonId).
    """
    if not scientific_name:
        return None

    # 1) scientificName + authorship (o authorship vacío/nulo)
    base_q = select(Taxon).where(Taxon.scientificName == scientific_name)
    if authorship:
        base_q = base_q.where(Taxon.scientificNameAuthorship == authorship)
    else:
        base_q = base_q.where(
            or_(
                Taxon.scientificNameAuthorship.is_(None),
                Taxon.scientificNameAuthorship == "",
            )
        )

    candidates = db.execute(base_q).scalars().all()

    # 2) Fallback: ignorar autoría si no encontramos nada
    if not candidates:
        q2 = select(Taxon).where(Taxon.scientificName == scientific_name)
        candidates = db.execute(q2).scalars().all()

    # Si sigue sin haber nada, no hay taxon
    if not candidates:
        return None

    # Si ya hay un único candidato, listo
    if len(candidates) == 1:
        return candidates[0]

    # A partir de aquí hay múltiples: intentamos refinar
    current = candidates

    # 3) Priorizar isCurrent = True
    current_only = [t for t in current if getattr(t, "isCurrent", False)]
    if len(current_only) == 1:
        return current_only[0]
    if current_only:
        current = current_only

    # 4) Priorizar Accepted + Valid
    accepted_valid = [
        t
        for t in current
        if getattr(t, "taxonomicStatus", None) == "Accepted"
        and getattr(t, "nomenclaturalStatus", None) == "Valid"
    ]
    if len(accepted_valid) == 1:
        return accepted_valid[0]
    if accepted_valid:
        current = accepted_valid

    # 5) Priorizar los que tienen tplID
    with_tplid = [t for t in current if getattr(t, "tplID", None)]
    if len(with_tplid) == 1:
        return with_tplid[0]

    # Sigue habiendo ambigüedad → no asignamos taxonId
    return None


# =========================
# Caso de uso: import CSV DwC
# =========================

def import_dwc_csv(
    db: Session, collection_id: UUID, file: UploadFile, current_user: User
) -> dict:
    # -------- Validaciones básicas de archivo --------
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe tener extensión .csv",
        )

    # -------- Colección + permisos --------
    collection = db.scalar(select(Collection).where(Collection.collectionId == collection_id))
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found"
        )

    if not user_can_edit_collection(db, current_user, collection):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para cargar en esta colección",
        )

    # -------- Leer CSV a memoria --------
    try:
        raw = file.file.read()
    finally:
        file.file.close()
    try:
        # Soporta BOM utf-8
        text = raw.decode("utf-8-sig")
    except Exception:
        try:
            text = raw.decode("latin-1")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo decodificar el CSV (utf-8/latin-1)",
            )

    reader = csv.reader(io.StringIO(text))
    headers = next(reader, None)
    if headers is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV vacío (sin headers)",
        )

    # -------- Validar headers estrictos --------
    try:
        colmap = _strict_parse_headers(headers)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    # -------- Validar columnas obligatorias (CABECERAS) --------
    required_headers = [
        ("Occurrence", "recordNumber"),
        ("Occurrence", "catalogNumber"),
        ("Occurrence", "recordedBy"),
        ("Taxon", "scientificName"),
        ("Taxon", "scientificNameAuthorship"),
        ("Identification", "identifiedBy"),  # header obligatorio, valor por fila puede ser vacío
    ]
    missing_cols = [
        f"dwc:{ent}:{field}"
        for (ent, field) in required_headers
        if (ent, field) not in colmap
    ]
    if missing_cols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Faltan columnas obligatorias en el CSV: " + ", ".join(missing_cols),
        )

    # -------- Caches de corrida y stats --------
    taxon_cache: Dict[Tuple[str, str], Optional[Taxon]] = {}
    stats = {
        "rows": 0,
        "occurrencesInserted": 0,
        "taxaMatched": 0,
        "identificationsInserted": 0,
        "identifiersInserted": 0,
    }

    BATCH_SIZE = 200
    rows_in_batch = 0
    row_number = 1  # header = línea 1

    # -------- Loop principal --------
    try:
        for row in reader:
            row_number += 1
            stats["rows"] += 1

            # Extract por entidad
            occ_d: Dict[str, Any] = {}
            tax_d: Dict[str, Any] = {}
            ident_d: Dict[str, Any] = {}

            for (entity, field), idx in colmap.items():
                val = _clean_value(row[idx] if idx < len(row) else "")
                if val is None:
                    continue

                if entity == "Occurrence":
                    if field == "dynamicProperties":
                        occ_d[field] = _to_json_value(val)
                    else:
                        # Solo setea si el atributo existe en el modelo
                        if hasattr(Occurrence, field):
                            occ_d[field] = val

                elif entity == "Event":
                    if field in {"year", "month", "day"}:
                        if hasattr(Occurrence, field):
                            occ_d[field] = _to_int(val)
                    else:
                        if hasattr(Occurrence, field):
                            occ_d[field] = val

                elif entity == "Location":
                    if field in {
                        "decimalLatitude",
                        "decimalLongitude",
                    }:
                        if hasattr(Occurrence, field):
                            occ_d[field] = _to_float(val)
                    else:
                        if hasattr(Occurrence, field):
                            occ_d[field] = val

                elif entity == "Taxon":
                    tax_d[field] = val

                elif entity == "Identification":
                    if field in {"isCurrent", "isVerified"}:
                        ident_d[field] = _to_bool(val)
                    else:
                        ident_d[field] = val

            # -------- SIN campos obligatorios por fila --------
            # Lo que venga se usa, lo que no venga se deja como None.
            sci_name = tax_d.get("scientificName")
            sci_auth = tax_d.get("scientificNameAuthorship")  # puede ser None/''

            identified_by_text = ident_d.get("identifiedBy")

            # -------- Resolver Taxon (no se crean taxones nuevos) --------
            # Lógica: solo asignar taxonId si se puede resolver un TAXON ÚNICO.
            # Si no hay scientificName, _resolve_unique_taxon_for_identification devolverá None.
            tkey = _taxon_key(sci_name, sci_auth)

            if tkey not in taxon_cache:
                taxon_cache[tkey] = _resolve_unique_taxon_for_identification(
                    db=db,
                    scientific_name=sci_name,
                    authorship=sci_auth,
                )

            taxon_obj = taxon_cache[tkey]

            if taxon_obj is not None:
                stats["taxaMatched"] += 1

            # -------- Crear Occurrence aplanado --------
            occ = Occurrence(**occ_d)
            occ.collectionId = collection_id
            occ.digitizerUserId = current_user.userId

            db.add(occ)
            db.flush()  # obtener occ.occurrenceId
            stats["occurrencesInserted"] += 1

            # -------- Identificación + Identifiers --------
            is_verified = ident_d.get("isVerified")
            if is_verified is None:
                is_verified = False

            identification_obj = Identification(
                occurrenceId=occ.occurrenceId,
                taxonId=taxon_obj.taxonId if taxon_obj is not None else None,
                scientificName=sci_name,
                scientificNameAuthorship=sci_auth,
                dateIdentified=ident_d.get("dateIdentified"),
                isCurrent=True,
                isVerified=is_verified,
                typeStatus=ident_d.get("typeStatus"),
            )
            db.add(identification_obj)
            db.flush()

            # Marcarla como currentIdentification de la Occurrence
            occ.currentIdentificationId = identification_obj.identificationId
            db.add(occ)

            stats["identificationsInserted"] += 1

            # Identificadores (personas) con orden — relación directa sin tabla intermedia
            names_list = _split_list(identified_by_text)

            for name in names_list:
                db.add(Identifier(
                    identificationId=identification_obj.identificationId,
                    fullName=name,
                ))
                stats["identifiersInserted"] += 1

            # ---- Commit por lotes ----
            rows_in_batch += 1
            if rows_in_batch >= BATCH_SIZE:
                db.commit()
                rows_in_batch = 0

        # Commit final
        if rows_in_batch > 0:
            db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error procesando CSV (fila {row_number}): {e}",
        ) from e

    return {
        "status": "ok",
        "collectionId": collection_id,
        **stats,
    }
