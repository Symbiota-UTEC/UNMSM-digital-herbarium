# backend/services/dwc_import.py
from __future__ import annotations

import codecs
import csv
import io
import json
from collections import OrderedDict
from typing import Any, BinaryIO, Dict, List, Optional, TextIO, Tuple
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.models import Collection, Identification, Identifier, Occurrence, Taxon, User
from backend.services.collection_permissions import user_can_edit_collection
from backend.services.occurrences import sync_geo_columns
from backend.utils.catalog import normalize_catalog_number
from backend.utils.dwc import ALLOWED_FIELDS, DWC_HEADER_RE

# ----------------------------
# Helpers claves / parsing
# ----------------------------


def _taxon_key(scientific_name: Optional[str], authorship: Optional[str]) -> Tuple[str, str]:
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
            errors.append(f"Field no permitido para {entity}: '{field}' (header '{h}')")
            continue

        key = (entity, field)
        if key in mapping:
            errors.append(f"Header duplicado: 'dwc:{entity}:{field}'")
            continue

        mapping[key] = idx

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


def _to_json_value(v: Optional[str]) -> Optional[Dict[str, Any]]:
    """Valida dynamicProperties como un objeto JSON o null."""
    if v is None:
        return None
    try:
        parsed = json.loads(v)
    except json.JSONDecodeError as e:
        raise ValueError("dynamicProperties no es un JSON válido") from e
    if parsed is not None and not isinstance(parsed, dict):
        raise ValueError("dynamicProperties debe ser un objeto JSON o null")
    return parsed


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


def _detect_csv_encoding(file_obj: BinaryIO) -> str:
    """Validate UTF-8 in bounded chunks; otherwise use the existing Latin-1 fallback."""
    decoder = codecs.getincrementaldecoder("utf-8-sig")("strict")
    file_obj.seek(0)
    try:
        while chunk := file_obj.read(1024 * 1024):
            decoder.decode(chunk)
        decoder.decode(b"", final=True)
        return "utf-8-sig"
    except UnicodeDecodeError:
        return "latin-1"
    finally:
        file_obj.seek(0)


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


def import_dwc_csv(db: Session, collection_id: UUID, file: UploadFile, current_user: User) -> dict:
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    if not user_can_edit_collection(db, current_user, collection):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para cargar en esta colección",
        )

    try:
        encoding = _detect_csv_encoding(file.file)
        with io.TextIOWrapper(file.file, encoding=encoding, newline="") as text_file:
            return _process_dwc_csv(db, collection, text_file, current_user)
    finally:
        file.file.close()


def _process_dwc_csv(
    db: Session, collection: Collection, text_file: TextIO, current_user: User
) -> dict:
    reader = csv.reader(text_file, strict=True)
    try:
        headers = next(reader, None)
    except csv.Error as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error en headers del CSV (línea {reader.line_num}): {e}",
        ) from e
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
    required_headers = [("Occurrence", "catalogNumber")]
    missing_cols = [
        f"dwc:{ent}:{field}" for (ent, field) in required_headers if (ent, field) not in colmap
    ]
    if missing_cols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Faltan columnas obligatorias en el CSV: " + ", ".join(missing_cols),
        )

    # -------- Caches de corrida y stats --------
    taxon_cache: OrderedDict[Tuple[str, str], Optional[UUID]] = OrderedDict()
    taxon_cache_size = 4096
    stats = {
        "rows": 0,
        "occurrencesInserted": 0,
        "taxaMatched": 0,
        "identificationsInserted": 0,
        "identifiersInserted": 0,
    }

    # -------- Loop principal --------
    try:
        for row in reader:
            if len(row) != len(headers):
                raise ValueError(f"se esperaban {len(headers)} columnas, se encontraron {len(row)}")
            stats["rows"] += 1

            # Extract por entidad
            occ_d: Dict[str, Any] = {}
            tax_d: Dict[str, Any] = {}
            ident_d: Dict[str, Any] = {}

            for (entity, field), idx in colmap.items():
                val = _clean_value(row[idx])
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
                    if field == "locationID":
                        occ_d["locationId"] = val
                    elif field in {
                        "decimalLatitude",
                        "decimalLongitude",
                        "coordinateUncertaintyInMeters",
                    }:
                        if hasattr(Occurrence, field):
                            number = _to_float(val)
                            # DwC: la incertidumbre debe ser > 0; 0 o negativo se trata como desconocida.
                            if (
                                field == "coordinateUncertaintyInMeters"
                                and number is not None
                                and number <= 0
                            ):
                                number = None
                            occ_d[field] = number
                    else:
                        if hasattr(Occurrence, field):
                            occ_d[field] = val

                elif entity == "Taxon":
                    tax_d[field] = val

                elif entity == "Identification":
                    if field == "isCurrent":
                        ident_d[field] = _to_bool(val)
                    else:
                        ident_d[field] = val

            # El número de catálogo es el único dato obligatorio por fila.
            occ_d["catalogNumber"] = normalize_catalog_number(occ_d.get("catalogNumber"))
            sci_name = tax_d.get("scientificName")
            sci_auth = tax_d.get("scientificNameAuthorship")  # puede ser None/''

            identified_by_text = ident_d.get("identifiedBy")

            # -------- Resolver Taxon (no se crean taxones nuevos) --------
            # Lógica: solo asignar taxonId si se puede resolver un TAXON ÚNICO.
            # Si no hay scientificName, _resolve_unique_taxon_for_identification devolverá None.
            tkey = _taxon_key(sci_name, sci_auth)

            if tkey in taxon_cache:
                taxon_cache.move_to_end(tkey)
            else:
                taxon_obj = _resolve_unique_taxon_for_identification(
                    db=db,
                    scientific_name=sci_name,
                    authorship=sci_auth,
                )
                taxon_cache[tkey] = taxon_obj.taxonId if taxon_obj is not None else None
                if len(taxon_cache) > taxon_cache_size:
                    taxon_cache.popitem(last=False)

            taxon_id = taxon_cache[tkey]

            if taxon_id is not None:
                stats["taxaMatched"] += 1

            # -------- Crear Occurrence aplanado --------
            occ = Occurrence(**occ_d)
            occ.collectionId = collection.collectionId
            occ.institutionId = collection.institutionId
            occ.digitizerUserId = current_user.userId
            sync_geo_columns(db, occ)

            db.add(occ)
            db.flush()  # obtener occ.occurrenceId
            stats["occurrencesInserted"] += 1

            # -------- Identificación + Identifiers --------
            identification_obj = Identification(
                occurrenceId=occ.occurrenceId,
                taxonId=taxon_id,
                scientificName=sci_name,
                scientificNameAuthorship=sci_auth,
                dateIdentified=ident_d.get("dateIdentified"),
                isCurrent=True,
                identificationVerificationStatus=ident_d.get("identificationVerificationStatus"),
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
                db.add(
                    Identifier(
                        identificationId=identification_obj.identificationId,
                        fullName=name,
                    )
                )
                stats["identifiersInserted"] += 1

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as e:
        db.rollback()
        constraint_name = getattr(getattr(e.orig, "diag", None), "constraint_name", None)
        if constraint_name == "uq_occurrence_institution_catalog":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Número de catálogo duplicado en esta institución (línea {reader.line_num})",
            ) from e
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error procesando CSV (línea {reader.line_num}): {e}",
        ) from e

    return {
        "status": "ok",
        "collectionId": collection.collectionId,
        **stats,
    }
