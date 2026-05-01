from __future__ import annotations
from uuid import UUID
# backend/routers/upload.py

import csv
import io
import json
import logging
import os
import requests
import tempfile
import uuid

from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy import select, exists, or_, update, text
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.inspection import inspect
from datetime import datetime

from backend.config.database import get_db, SessionLocal
from backend.config.settings import seaweedfs_internal_url, seaweedfs_public_url
from backend.auth.jwt import get_current_user, require_superuser
from backend.models.models import (
    User,
    Collection,
    CollectionPermission,
    Occurrence,
    Taxon,
    TaxonFloraImportJob,
    Identifier,
    Identification,
    OccurrenceImage,
)
from backend.schemas.upload import (
    TaxonFloraImportJobListOut,
    TaxonFloraImportJobOut,
    TaxonFloraUploadAcceptedOut,
)

from backend.utils.dwc import (
    DWC_HEADER_RE,
    ALLOWED_FIELDS,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/upload",
    tags=["Files"],
)

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


def _utcnow() -> datetime:
    return datetime.utcnow()


def _calculate_progress_metrics(
    *,
    file_size_bytes: Optional[int],
    bytes_processed: Optional[int],
    started_at: Optional[datetime],
) -> Tuple[Optional[float], Optional[int]]:
    if not file_size_bytes or file_size_bytes <= 0 or bytes_processed is None:
        return None, None

    bounded_bytes = min(max(bytes_processed, 0), file_size_bytes)
    progress_percent = round((bounded_bytes / file_size_bytes) * 100, 2)

    if (
        started_at is None
        or bounded_bytes <= 0
        or bounded_bytes >= file_size_bytes
    ):
        eta_seconds = 0 if bounded_bytes >= file_size_bytes else None
        return progress_percent, eta_seconds

    elapsed_seconds = (_utcnow() - started_at).total_seconds()
    if elapsed_seconds <= 0:
        return progress_percent, None

    bytes_per_second = bounded_bytes / elapsed_seconds
    if bytes_per_second <= 0:
        return progress_percent, None

    remaining_bytes = max(file_size_bytes - bounded_bytes, 0)
    eta_seconds = int(round(remaining_bytes / bytes_per_second))
    return progress_percent, max(eta_seconds, 0)


def _queue_taxon_flora_job_update(
    db: Session,
    job_id: UUID,
    *,
    status_value: Optional[str] = None,
    stage: Optional[str] = None,
    detail: Optional[str] = None,
    error_message: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
    bytes_processed: Optional[int] = None,
    started_at: Optional[datetime] = None,
    finished_at: Optional[datetime] = None,
    rows_processed: Optional[int] = None,
    rows_filtered_out: Optional[int] = None,
    taxa_marked_not_current: Optional[int] = None,
    taxa_inserted: Optional[int] = None,
    taxa_updated: Optional[int] = None,
    taxa_set_current: Optional[int] = None,
    last_processed_row: Optional[int] = None,
    force_percent: Optional[float] = None,
    force_eta_seconds: Optional[int] = None,
) -> None:
    values: Dict[str, Any] = {}

    if status_value is not None:
        values["status"] = status_value
    if stage is not None:
        values["stage"] = stage
    if detail is not None:
        values["detail"] = detail
    if error_message is not None:
        values["errorMessage"] = error_message
    if file_size_bytes is not None:
        values["fileSizeBytes"] = file_size_bytes
    if bytes_processed is not None:
        bounded_bytes = (
            min(max(bytes_processed, 0), file_size_bytes)
            if file_size_bytes is not None and file_size_bytes > 0
            else max(bytes_processed, 0)
        )
        values["bytesProcessed"] = bounded_bytes
    if started_at is not None:
        values["startedAt"] = started_at
    if finished_at is not None:
        values["finishedAt"] = finished_at
    if rows_processed is not None:
        values["rowsProcessed"] = rows_processed
    if rows_filtered_out is not None:
        values["rowsFilteredOut"] = rows_filtered_out
    if taxa_marked_not_current is not None:
        values["taxaMarkedNotCurrent"] = taxa_marked_not_current
    if taxa_inserted is not None:
        values["taxaInserted"] = taxa_inserted
    if taxa_updated is not None:
        values["taxaUpdated"] = taxa_updated
    if taxa_set_current is not None:
        values["taxaSetCurrent"] = taxa_set_current
    if last_processed_row is not None:
        values["lastProcessedRow"] = last_processed_row

    if force_percent is not None:
        values["progressPercent"] = force_percent
    elif file_size_bytes is not None and bytes_processed is not None:
        progress_percent, _ = _calculate_progress_metrics(
            file_size_bytes=file_size_bytes,
            bytes_processed=bytes_processed,
            started_at=started_at,
        )
        values["progressPercent"] = progress_percent

    if force_eta_seconds is not None:
        values["estimatedSecondsRemaining"] = force_eta_seconds
    elif file_size_bytes is not None and bytes_processed is not None:
        _, eta_seconds = _calculate_progress_metrics(
            file_size_bytes=file_size_bytes,
            bytes_processed=bytes_processed,
            started_at=started_at,
        )
        values["estimatedSecondsRemaining"] = eta_seconds

    if values:
        db.execute(
            update(TaxonFloraImportJob)
            .where(TaxonFloraImportJob.jobId == job_id)
            .values(**values)
        )


def _commit_taxon_flora_job_update(job_id: UUID, **kwargs: Any) -> None:
    """Commit job progress independently from the long taxon import transaction."""
    progress_db = SessionLocal()
    try:
        _queue_taxon_flora_job_update(progress_db, job_id, **kwargs)
        progress_db.commit()
    except Exception:
        progress_db.rollback()
        logger.exception("No se pudo actualizar el progreso del job %s", job_id)
    finally:
        progress_db.close()


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
    if user.isSuperuser:
        return True

    perm_exists = db.scalar(
        select(
            exists().where(
                (CollectionPermission.collectionId == collection.collectionId)
                & (CollectionPermission.userId == user.userId)
                & (CollectionPermission.role.in_(["editor", "owner"]))
            )
        )
    )
    if perm_exists:
        return True

    if (
        user.isInstitutionAdmin
        and collection.institutionId is not None
        and user.institutionId is not None
        and int(collection.institutionId) == int(user.institutionId)
    ):
        return True

    return False


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
# Endpoint: Upload DWC CSV
# =========================
@router.post(
    "/dwc-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Sube un CSV DwC estricto y lo inserta a una colección",
)
def upload_dwc_csv(
    collection_id: UUID = Form(..., description="ID de la colección destino"),
    file: UploadFile = File(
        ..., description="Archivo CSV (DwC headers: dwc:Entity:field)"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    - Valida extensión y contenido CSV.
    - Valida headers estrictos 'dwc:Entity:field'.
    - Inserta Occurrence aplanado (Occurrence + Event + Location).
    - Crea SIEMPRE una Identification por fila con:
        * scientificName y scientificNameAuthorship copiados del bloque Taxon (si vienen).
        * Un taxonId asignado SOLO si se puede resolver un Taxon único
          según la lógica de resolución (backbone ya cargado).
    - Crea Identifier(s) según identifiedBy
      vinculados directamente a la Identification, **solo si vienen nombres/IDs**.
    - Marca la Identification creada como isCurrent = True y la asigna como
      currentIdentification de la Occurrence.
    - A NIVEL DE CABECERA (no por fila) se exigen las columnas:
        * dwc:Occurrence:recordNumber
        * dwc:Occurrence:catalogNumber
        * dwc:Occurrence:recordedBy
        * dwc:Taxon:scientificName
        * dwc:Taxon:scientificNameAuthorship
        * dwc:Identification:identifiedBy
      A NIVEL DE FILA:
        - Ningún valor es obligatorio. Si viene vacío, se deja el atributo como None.
    """
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

    if not _user_can_edit_collection(db, current_user, collection):
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


# =========================
# Endpoint: Upload CSV de flora (backbone Taxon, separado por tabs)
# =========================

def _process_taxon_flora_csv_background(
    file_path: str,
    filename: str,
    job_id: UUID,
) -> None:
    """
    Procesa el CSV de flora en segundo plano (sin bloquear el request).
    Usa una sesión propia de BD.
    """
    db = SessionLocal()
    started_at = _utcnow()
    file_size_bytes = os.path.getsize(file_path)
    row_number = 1
    stats: Dict[str, Any] = {
        "rows": 0,
        "rowsFilteredOut": 0,
        "taxaMarkedNotCurrent": 0,
        "taxaInserted": 0,
        "taxaUpdated": 0,
        "taxaSetCurrent": 0,
    }

    def publish_progress(
        *,
        status_value: Optional[str] = None,
        stage: Optional[str] = None,
        detail: Optional[str] = None,
        error_message: Optional[str] = None,
        bytes_processed: Optional[int] = None,
        finished_at: Optional[datetime] = None,
        force_percent: Optional[float] = None,
        force_eta_seconds: Optional[int] = None,
    ) -> None:
        _commit_taxon_flora_job_update(
            job_id,
            status_value=status_value,
            stage=stage,
            detail=detail,
            error_message=error_message,
            file_size_bytes=file_size_bytes,
            bytes_processed=bytes_processed,
            started_at=started_at,
            finished_at=finished_at,
            rows_processed=stats["rows"],
            rows_filtered_out=stats["rowsFilteredOut"],
            taxa_marked_not_current=stats["taxaMarkedNotCurrent"],
            taxa_inserted=stats["taxaInserted"],
            taxa_updated=stats["taxaUpdated"],
            taxa_set_current=stats["taxaSetCurrent"],
            last_processed_row=row_number,
            force_percent=force_percent,
            force_eta_seconds=force_eta_seconds,
        )

    def build_taxon_values(
        row: List[str],
        headers: List[str],
        header_index: Dict[str, int],
        mapped_fields: List[str],
    ) -> Optional[Dict[str, Any]]:
        if len(row) < len(headers):
            row = row + [""] * (len(headers) - len(row))

        taxonomic_status_raw = row[header_index["taxonomicStatus"]]
        nomenclatural_status_raw = row[header_index["nomenclaturalStatus"]]
        name_published_in_raw = row[header_index["namePublishedIn"]]

        taxonomic_status = (taxonomic_status_raw or "").strip()
        nomenclatural_status = (nomenclatural_status_raw or "").strip()
        name_published_in = (name_published_in_raw or "").strip()

        # Si quieres reactivar el filtro estricto, descomenta:
        # if (
        #     taxonomic_status != "Accepted"
        #     or nomenclatural_status != "Valid"
        #     or not name_published_in
        # ):
        #     stats["rowsFilteredOut"] += 1
        #     return None

        taxon_id_raw = row[header_index["taxonID"]]
        taxon_id_value = (taxon_id_raw or "").strip()

        if not taxon_id_value:
            logger.warning(
                "Fila %s: 'taxonID' vacío; se omite fila en backbone flora",
                row_number,
            )
            return None

        field_values: Dict[str, Any] = {}
        for field in mapped_fields:
            idx = header_index[field]
            raw_val = row[idx] if idx < len(row) else ""
            v = (raw_val or "").strip()
            field_values[field] = v if v != "" else None

        field_values["wfoTaxonId"] = taxon_id_value
        return field_values

    def process_batch(
        batch: List[Dict[str, Any]],
        mapped_fields: List[str],
    ) -> None:
        if not batch:
            return

        taxon_ids = [item["wfoTaxonId"] for item in batch]
        existing_by_wfo = {
            taxon.wfoTaxonId: taxon
            for taxon in db.execute(
                select(Taxon).where(Taxon.wfoTaxonId.in_(taxon_ids))
            ).scalars()
        }

        for field_values in batch:
            taxon_id_value = field_values["wfoTaxonId"]
            taxon_obj = existing_by_wfo.get(taxon_id_value)

            if taxon_obj is None:
                taxon_obj = Taxon(**field_values)
                taxon_obj.isCurrent = True
                db.add(taxon_obj)
                existing_by_wfo[taxon_id_value] = taxon_obj
                stats["taxaInserted"] += 1
                stats["taxaSetCurrent"] += 1
                continue

            changed = False
            for field in mapped_fields:
                value = field_values.get(field)
                if getattr(taxon_obj, field) != value:
                    setattr(taxon_obj, field, value)
                    changed = True

            if taxon_obj.wfoTaxonId != taxon_id_value:
                taxon_obj.wfoTaxonId = taxon_id_value
                changed = True

            if not taxon_obj.isCurrent:
                taxon_obj.isCurrent = True
                changed = True
                stats["taxaSetCurrent"] += 1

            if changed:
                db.add(taxon_obj)
                stats["taxaUpdated"] += 1

    try:
        publish_progress(
            status_value="running",
            stage="Preparando importación",
            detail="Validando encabezados y preparando el archivo.",
            bytes_processed=0,
            force_percent=0.0,
            force_eta_seconds=None,
        )

        with open(file_path, "rb") as bin_file:
            sample = bin_file.read(65536)  # 64 KB
            encoding = "utf-8-sig"
            try:
                sample.decode("utf-8-sig")
            except UnicodeDecodeError:
                encoding = "latin-1"

            bin_file.seek(0)

            def decoded_lines(f, enc):
                while True:
                    bline = f.readline()
                    if not bline:
                        break

                    if b'\xc2"' in bline:
                        logger.warning(
                            "Parche UTF-8 aplicado en línea con patrón \\xc2\\\": %r",
                            bline[:200],
                        )
                        bline = bline.replace(b'\xc2"', b'"')

                    try:
                        yield bline.decode(enc)
                    except UnicodeDecodeError:
                        yield bline.decode("latin-1", errors="replace")

            reader = csv.reader(decoded_lines(bin_file, encoding), delimiter="\t")
            headers = next(reader, None)
            if not headers:
                logger.error("CSV vacío (sin headers) en backbone flora: %s", filename)
                publish_progress(
                    status_value="failed",
                    stage="Falló la importación",
                    detail="El archivo no contiene encabezados válidos.",
                    error_message="CSV vacío (sin headers).",
                    bytes_processed=min(bin_file.tell(), file_size_bytes),
                    finished_at=_utcnow(),
                )
                return

            headers = [h.strip() for h in headers]
            header_index = {name: idx for idx, name in enumerate(headers)}

            if "taxonID" not in header_index:
                logger.error("El CSV de flora no tiene columna 'taxonID': %s", filename)
                publish_progress(
                    status_value="failed",
                    stage="Falló la importación",
                    detail="El archivo no contiene la columna taxonID.",
                    error_message="Falta la columna requerida 'taxonID'.",
                    bytes_processed=min(bin_file.tell(), file_size_bytes),
                    finished_at=_utcnow(),
                )
                return

            required_filter_cols = ["taxonomicStatus", "nomenclaturalStatus", "namePublishedIn"]
            missing_filter_cols = [c for c in required_filter_cols if c not in header_index]
            if missing_filter_cols:
                logger.error(
                    "El CSV de flora no tiene columnas requeridas para filtrar: %s",
                    ", ".join(missing_filter_cols),
                )
                publish_progress(
                    status_value="failed",
                    stage="Falló la importación",
                    detail="El archivo no contiene todas las columnas requeridas.",
                    error_message=(
                        "Faltan columnas requeridas: "
                        + ", ".join(missing_filter_cols)
                    ),
                    bytes_processed=min(bin_file.tell(), file_size_bytes),
                    finished_at=_utcnow(),
                )
                return

            taxon_mapper = inspect(Taxon)
            model_attrs: set[str] = set(taxon_mapper.columns.keys())

            blocked_fields = {"id", "taxonId", "isCurrent"}
            updatable_fields = model_attrs - blocked_fields
            mapped_fields = [name for name in headers if name in updatable_fields]

            if not mapped_fields:
                logger.error(
                    "Ninguna columna del CSV coincide con atributos del modelo Taxon (aparte de 'id' e 'isCurrent')."
                )
                publish_progress(
                    status_value="failed",
                    stage="Falló la importación",
                    detail="Ninguna columna del CSV coincide con el modelo Taxon.",
                    error_message="No hay columnas compatibles para importar.",
                    bytes_processed=min(bin_file.tell(), file_size_bytes),
                    finished_at=_utcnow(),
                )
                return

            batch_size = 2000
            batch: List[Dict[str, Any]] = []

            try:
                with db.begin():
                    db.execute(
                        text("SELECT pg_advisory_xact_lock(:lock_id)"),
                        {"lock_id": 872341905},
                    )

                    result = db.execute(update(Taxon).values(isCurrent=False))
                    stats["taxaMarkedNotCurrent"] = result.rowcount or 0
                    publish_progress(
                        stage="Procesando filas",
                        detail="Importando taxones desde el CSV.",
                        bytes_processed=bin_file.tell(),
                    )

                    for row in reader:
                        row_number += 1
                        stats["rows"] += 1

                        field_values = build_taxon_values(
                            row,
                            headers,
                            header_index,
                            mapped_fields,
                        )
                        if field_values is not None:
                            batch.append(field_values)

                        if len(batch) >= batch_size:
                            process_batch(batch, mapped_fields)
                            db.flush()
                            db.expunge_all()
                            batch = []
                            publish_progress(
                                stage="Procesando filas",
                                detail="Importando taxones desde el CSV.",
                                bytes_processed=bin_file.tell(),
                            )

                    if batch:
                        process_batch(batch, mapped_fields)
                        db.flush()
                        db.expunge_all()
                        publish_progress(
                            stage="Procesando filas",
                            detail="Importando taxones desde el CSV.",
                            bytes_processed=bin_file.tell(),
                        )

                publish_progress(
                    status_value="completed",
                    stage="Completado",
                    detail="La importación terminó correctamente.",
                    bytes_processed=file_size_bytes,
                    finished_at=_utcnow(),
                    force_percent=100.0,
                    force_eta_seconds=0,
                )

                logger.info("Backbone flora procesado en background: %s", stats)

            except Exception as e:
                db.rollback()
                publish_progress(
                    status_value="failed",
                    stage="Falló la importación",
                    detail="La importación falló. El backbone anterior se mantuvo intacto.",
                    error_message=f"Fila {row_number}: {e}",
                    bytes_processed=min(bin_file.tell(), file_size_bytes),
                    finished_at=_utcnow(),
                )
                logger.exception(
                    "Error procesando CSV de flora en background (fila %s): %s",
                    row_number,
                    e,
                )
    except Exception as e:
        db.rollback()
        publish_progress(
            status_value="failed",
            stage="Falló la importación",
            detail="No se pudo iniciar el procesamiento del archivo.",
            error_message=str(e),
            bytes_processed=0,
            finished_at=_utcnow(),
        )
        logger.exception("Error preparando CSV de flora en background: %s", e)
    finally:
        try:
            os.remove(file_path)
        except FileNotFoundError:
            pass
        except Exception:
            logger.warning(
                "No se pudo eliminar el archivo temporal %s",
                file_path,
                exc_info=True,
            )
        db.close()


@router.get(
    "/taxon-flora-csv/jobs",
    response_model=TaxonFloraImportJobListOut,
    summary="Lista los trabajos recientes de importación del backbone Taxon.",
)
def list_taxon_flora_import_jobs(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    del current_user

    jobs = db.scalars(
        select(TaxonFloraImportJob)
        .order_by(TaxonFloraImportJob.createdAt.desc())
        .limit(limit)
    ).all()

    return TaxonFloraImportJobListOut(items=jobs)


@router.get(
    "/taxon-flora-csv/jobs/{job_id}",
    response_model=TaxonFloraImportJobOut,
    summary="Obtiene el estado actual de un trabajo de importación del backbone Taxon.",
)
def get_taxon_flora_import_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    del current_user

    job = db.get(TaxonFloraImportJob, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trabajo de importación no encontrado.",
        )

    return job


@router.post(
    "/taxon-flora-csv",
    status_code=status.HTTP_202_ACCEPTED,
    summary="(Async) Carga/actualiza el backbone Taxon (flora) desde un CSV tabulado",
    response_model=TaxonFloraUploadAcceptedOut,
)
async def upload_taxon_flora_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(
        ...,
        description=(
            "CSV de flora (extensión .csv) separado por tabulaciones, con cabeceras que "
            "coinciden con atributos del modelo Taxon (incluyendo 'taxonID')."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    """
    Versión asíncrona:
    - Valida extensión y guarda el archivo en disco por chunks.
    - Agenda un BackgroundTask que:
        * Marca todos los Taxon como isCurrent = False.
        * Recorre el CSV tabulado.
        * Inserta/actualiza Taxon usando taxonID como clave.
    - Retorna inmediatamente con 202 Accepted.
    """

    original_filename = (file.filename or "").strip()
    filename = original_filename.lower()
    logger.info("Subiendo backbone flora CSV (async): %s", original_filename or filename)

    if not filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe tener extensión .csv",
        )

    active_job = db.scalar(
        select(TaxonFloraImportJob)
        .where(TaxonFloraImportJob.status.in_(["queued", "running"]))
        .order_by(TaxonFloraImportJob.createdAt.desc())
        .limit(1)
    )
    if active_job is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Ya existe una importación de flora en curso "
                f"({active_job.status}, jobId={active_job.jobId})."
            ),
        )

    temp_path = ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            suffix=".csv",
            prefix="taxon_flora_",
            delete=False,
        ) as temp_file:
            temp_path = temp_file.name
            while True:
                chunk = await file.read(8 * 1024 * 1024)
                if not chunk:
                    break
                temp_file.write(chunk)
    finally:
        await file.close()

    if not temp_path or os.path.getsize(temp_path) == 0:
        if temp_path:
            try:
                os.remove(temp_path)
            except FileNotFoundError:
                pass
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archivo vacío.",
        )

    job = TaxonFloraImportJob(
        filename=original_filename or filename,
        status="queued",
        stage="En cola",
        detail="Archivo recibido. Esperando el procesamiento en segundo plano.",
        fileSizeBytes=os.path.getsize(temp_path),
        bytesProcessed=0,
        progressPercent=0.0,
        estimatedSecondsRemaining=None,
        uploadedByUserId=current_user.userId,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Agendar procesamiento en background
    background_tasks.add_task(
        _process_taxon_flora_csv_background,
        temp_path,
        original_filename or filename,
        job.jobId,
    )

    # Respuesta inmediata (no tenemos stats aún)
    return {
        "status": "accepted",
        "backbone": "taxon",
        "filename": original_filename or filename,
        "detail": "El archivo se está procesando en segundo plano.",
        "jobId": job.jobId,
    }


@router.post(
    "/image",
    status_code=status.HTTP_201_CREATED,
    summary="Subir una imagen y asociarla a una Occurrence a través de SeaweedFS",
)
def upload_image_seaweedfs(
    occurrence_id: UUID = Form(..., description="ID de la Ocurrencia destino"),
    file: UploadFile = File(..., description="Archivo de imagen"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sube una imagen al cluster de SeaweedFS y crea un OccurrenceImage.
    """

    occurrence = db.scalar(select(Occurrence).where(Occurrence.occurrenceId == occurrence_id))
    if not occurrence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found"
        )
        
    if not _user_can_edit_collection(db, current_user, occurrence.collection):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para editar esta colección",
        )

    # 1. Subir imagen a SeaweedFS Filer (en herbarium_seaweedfs:8888)
    try:
        institution_name = "UnknownInstitution"
        collection_id = "UnknownCollection"
        catalog_number = occurrence.catalogNumber or "UnknownCatalog"

        if occurrence.collection:
            collection_id = str(occurrence.collection.collectionId) if occurrence.collection.collectionId else "UnknownCollection"
            if occurrence.collection.institution:
                institution_name = occurrence.collection.institution.institutionName or "UnknownInstitution"

        # Sanitizar rutas para URL
        institution_name_safe = institution_name.replace(" ", "_").replace("/", "-")
        collection_id_safe = collection_id.replace(" ", "_").replace("/", "-")
        catalog_number_safe = catalog_number.replace(" ", "_").replace("/", "-")
        
        safe_filename = file.filename.replace(" ", "_")
        unique_filename = f"{uuid.uuid4()}_{safe_filename}"
        
        image_path = f"/images/{institution_name_safe}/{collection_id_safe}/{catalog_number_safe}/{unique_filename}"
        upload_url = f"{seaweedfs_internal_url}{image_path}"
        
        files = {"file": (file.filename, file.file, file.content_type)}
        upload_res = requests.post(upload_url, files=files)
        upload_res.raise_for_status()
        
        # Filer devuelve información json sobre la carga
        upload_data = upload_res.json()
        file_size = upload_data.get("size", 0)
    except Exception as e:
        logger.error(f"Error subiendo imagen a SeaweedFS Filer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error copiando el archivo al servidor de archivos (Filer)",
        )

    # 2. Guardar en Base de Datos
    occ_img = OccurrenceImage(
        occurrenceId=occurrence.occurrenceId,
        imagePath=image_path,
        fileSize=file_size,
        photographer=current_user.fullName or current_user.username
    )
    
    db.add(occ_img)
    db.commit()
    db.refresh(occ_img)

    return {
        "status": "ok",
        "occurrenceImageId": occ_img.occurrenceImageId,
        "occurrenceId": occurrence.occurrenceId,
        "imagePath": image_path,
        "size": file_size,
        "publicUrl": f"{seaweedfs_public_url}{image_path}"
    }


@router.delete(
    "/image/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una imagen por su ID",
)
def delete_image(
    image_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    image = db.scalar(select(OccurrenceImage).where(OccurrenceImage.occurrenceImageId == image_id))
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    # Load occurrence + collection for permission check
    occurrence = db.scalar(
        select(Occurrence)
        .options(selectinload(Occurrence.collection))
        .where(Occurrence.occurrenceId == image.occurrenceId)
    )
    if not occurrence or not occurrence.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not _user_can_edit_collection(db, current_user, occurrence.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para eliminar esta imagen")

    # Delete from SeaweedFS
    try:
        delete_url = f"{seaweedfs_internal_url}{image.imagePath}"
        requests.delete(delete_url, timeout=10)
    except Exception as e:
        logger.warning(f"Could not delete image from SeaweedFS: {e}")

    db.delete(image)
    db.commit()


@router.get(
    "/image/{image_id}",
    summary="Descargar u obtener una imagen por su ID",
)
def get_image_seaweedfs(
    image_id: UUID,
    db: Session = Depends(get_db),
):
    """
    Obtiene una imagen de SeaweedFS consultando su ruta original mediante el OccurrenceImage ID
    """
    image = db.scalar(select(OccurrenceImage).where(OccurrenceImage.occurrenceImageId == image_id))
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found"
        )
    
    # URL interna definida para SeaweedFS en docker network
    download_url = f"http://herbarium_seaweedfs:8888{image.imagePath}"
    
    try:
        response = requests.get(download_url, stream=True)
        response.raise_for_status()
        
        return StreamingResponse(
            response.iter_content(chunk_size=1024*1024),
            media_type=response.headers.get("Content-Type", "image/jpeg"),
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"Error downloading image from SeaweedFS: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error downloading image from SeaweedFS"
        )
