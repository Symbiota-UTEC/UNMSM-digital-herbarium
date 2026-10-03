# backend/services/dwc_import.py
from __future__ import annotations

import codecs
import csv
import io
import json
import logging
import os
import tempfile
import time
from collections import OrderedDict
from datetime import datetime
from typing import Any, BinaryIO, Callable, Dict, List, Optional, TextIO, Tuple
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config.database import SessionLocal
from backend.models.enums import ImportJobStatus
from backend.models.models import (
    Collection,
    DwcImportJob,
    Identification,
    Identifier,
    Occurrence,
    Taxon,
    User,
)
from backend.schemas.common.pages import Page
from backend.schemas.upload import DwcImportJobOut
from backend.services.collection_permissions import user_can_edit_collection
from backend.services.occurrences import sync_geo_columns
from backend.utils.catalog import normalize_catalog_number
from backend.utils.dwc import ALLOWED_FIELDS, DWC_HEADER_RE

logger = logging.getLogger(__name__)

DWC_PROGRESS_ROW_INTERVAL = 100
DWC_PROGRESS_TIME_INTERVAL = 1.0
UPLOAD_CHUNK_SIZE = 1024 * 1024

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


def _validate_dwc_csv_headers(reader: csv.reader) -> Tuple[List[str], Dict[Tuple[str, str], int]]:
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

    try:
        colmap = _strict_parse_headers(headers)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    if ("Occurrence", "catalogNumber") not in colmap:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Faltan columnas obligatorias en el CSV: dwc:Occurrence:catalogNumber",
        )
    return headers, colmap


def _inspect_dwc_csv(file_path: str) -> Tuple[str, int]:
    """Detect encoding, validate the header and count CSV records without loading the file."""
    with open(file_path, "rb") as binary_file:
        encoding = _detect_csv_encoding(binary_file)

    with open(file_path, "rb") as binary_file:
        with io.TextIOWrapper(binary_file, encoding=encoding, newline="") as text_file:
            reader = csv.reader(text_file, strict=True)
            _validate_dwc_csv_headers(reader)
            try:
                total_rows = sum(1 for _ in reader)
            except csv.Error as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Error procesando CSV (línea {reader.line_num}): {e}",
                ) from e

    if total_rows < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV sin filas de datos.",
        )
    return encoding, total_rows


def _commit_dwc_job_update(job_id: UUID, **values: Any) -> None:
    """Write progress in a short transaction separate from the specimen import."""
    progress_db: Optional[Session] = None
    try:
        progress_db = SessionLocal()
        progress_db.execute(
            update(DwcImportJob).where(DwcImportJob.jobId == job_id).values(**values)
        )
        progress_db.commit()
    except Exception:
        if progress_db is not None:
            progress_db.rollback()
        logger.exception("No se pudo actualizar el progreso de la importación DwC %s", job_id)
    finally:
        if progress_db is not None:
            progress_db.close()


def _finish_dwc_job_failed(job_id: UUID, error_message: str) -> None:
    _commit_dwc_job_update(
        job_id,
        status=ImportJobStatus.FAILED,
        stage="Falló la importación",
        detail="No se importaron ocurrencias. La transacción fue revertida.",
        errorMessage=error_message[:8000],
        finishedAt=datetime.utcnow(),
        activeInstitutionId=None,
        occurrencesInserted=0,
        taxaMatched=0,
        taxaUnmatched=0,
        identificationsInserted=0,
        identifiersInserted=0,
    )


def _cleanup_dwc_job_file(job_id: UUID, file_path: Optional[str]) -> None:
    if file_path:
        try:
            os.remove(file_path)
        except FileNotFoundError:
            pass
        except Exception:
            logger.warning("No se pudo eliminar el CSV temporal %s", file_path, exc_info=True)
    _commit_dwc_job_update(job_id, temporaryFilePath=None)


def recover_interrupted_dwc_import_jobs() -> None:
    """Fail jobs left active by a process restart and remove their temporary files."""
    db: Optional[Session] = None
    file_paths: List[str] = []
    try:
        db = SessionLocal()
        jobs = db.scalars(
            select(DwcImportJob).where(
                or_(
                    DwcImportJob.activeInstitutionId.is_not(None),
                    DwcImportJob.temporaryFilePath.is_not(None),
                )
            )
        ).all()
        now = datetime.utcnow()
        for job in jobs:
            if job.activeInstitutionId is not None:
                job.status = ImportJobStatus.FAILED
                job.stage = "Interrumpida"
                job.detail = (
                    "El servidor se reinició. No se importaron ocurrencias; vuelve a subir el CSV."
                )
                job.errorMessage = "La importación se interrumpió al reiniciarse el backend."
                job.finishedAt = now
                job.activeInstitutionId = None
                job.occurrencesInserted = 0
                job.taxaMatched = 0
                job.taxaUnmatched = 0
                job.identificationsInserted = 0
                job.identifiersInserted = 0
            if job.temporaryFilePath:
                file_paths.append(job.temporaryFilePath)
                job.temporaryFilePath = None
        db.commit()
    except Exception:
        if db is not None:
            db.rollback()
        logger.exception("No se pudieron recuperar las importaciones DwC interrumpidas")
    finally:
        if db is not None:
            db.close()

    for file_path in file_paths:
        try:
            os.remove(file_path)
        except FileNotFoundError:
            pass
        except Exception:
            logger.warning("No se pudo eliminar el CSV temporal %s", file_path, exc_info=True)


def _reserve_dwc_import_job(
    db: Session,
    collection: Collection,
    current_user: User,
    filename: str,
    *,
    stage: str,
    detail: str,
) -> DwcImportJob:
    active_job = db.scalar(
        select(DwcImportJob)
        .where(DwcImportJob.activeInstitutionId == collection.institutionId)
        .limit(1)
    )
    if active_job is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Ya existe una importación CSV activa para esta institución "
                f"(jobId={active_job.jobId})."
            ),
        )

    job = DwcImportJob(
        collectionId=collection.collectionId,
        institutionId=collection.institutionId,
        activeInstitutionId=collection.institutionId,
        uploadedByUserId=current_user.userId,
        filename=filename[:255],
        status=ImportJobStatus.QUEUED,
        stage=stage,
        detail=detail,
        rowsProcessed=0,
        progressPercent=None,
    )
    db.add(job)
    try:
        db.commit()
        db.refresh(job)
    except IntegrityError as e:
        db.rollback()
        constraint_name = getattr(getattr(e.orig, "diag", None), "constraint_name", None)
        if constraint_name == "uq_dwc_import_one_active_per_institution":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una importación CSV activa para esta institución.",
            ) from e
        raise
    return job


def _make_dwc_progress_publisher(
    job_id: UUID, total_rows: Optional[int]
) -> Callable[[Dict[str, int], bool, str], None]:
    last_published = [time.monotonic()]

    def publish_progress(stats: Dict[str, int], force: bool, stage: str) -> None:
        rows_processed = stats["rows"]
        if (
            not force
            and rows_processed % DWC_PROGRESS_ROW_INTERVAL
            and (time.monotonic() - last_published[0] < DWC_PROGRESS_TIME_INTERVAL)
        ):
            return

        progress_percent = min(rows_processed * 100.0 / total_rows, 100.0) if total_rows else None
        detail = (
            f"{rows_processed:,} de {total_rows:,} filas procesadas.".replace(",", ".")
            if total_rows is not None
            else f"{rows_processed:,} filas procesadas.".replace(",", ".")
        )
        if stage == "Guardando cambios":
            detail = "Todas las filas se procesaron. Guardando la transacción."

        _commit_dwc_job_update(
            job_id,
            stage=stage,
            detail=detail,
            rowsProcessed=rows_processed,
            progressPercent=progress_percent,
            occurrencesInserted=stats["occurrencesInserted"],
            taxaMatched=stats["taxaMatched"],
            taxaUnmatched=stats["taxaUnmatched"],
            identificationsInserted=stats["identificationsInserted"],
            identifiersInserted=stats["identifiersInserted"],
        )
        last_published[0] = time.monotonic()

    return publish_progress


async def enqueue_dwc_csv_import(
    db: Session,
    background_tasks: BackgroundTasks,
    collection_id: UUID,
    file: UploadFile,
    current_user: User,
) -> dict:
    """Persist an accepted job and stage its upload on disk for background processing."""
    original_filename = (file.filename or "occurrences.csv").replace("\\", "/").rsplit("/", 1)[-1]
    if not original_filename.lower().endswith(".csv"):
        await file.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe tener extensión .csv",
        )

    collection = db.scalar(select(Collection).where(Collection.collectionId == collection_id))
    if collection is None:
        await file.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    if not user_can_edit_collection(db, current_user, collection):
        await file.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para cargar en esta colección",
        )

    try:
        job = _reserve_dwc_import_job(
            db,
            collection,
            current_user,
            original_filename,
            stage="Recibiendo archivo",
            detail="El CSV se está copiando al servidor.",
        )
    except BaseException:
        await file.close()
        raise

    file_path = os.path.join(tempfile.gettempdir(), f"dwc_import_{job.jobId}.csv")
    job.temporaryFilePath = file_path
    try:
        # Persist the path before writing bytes so startup recovery can clean up after a crash.
        db.commit()
        bytes_received = 0
        with open(file_path, "wb") as destination:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                destination.write(chunk)
                bytes_received += len(chunk)
        if bytes_received == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Archivo vacío.",
            )

        job.fileSizeBytes = bytes_received
        job.stage = "En cola"
        job.detail = "Archivo recibido. Preparando el conteo de filas."
        db.commit()
    except BaseException as e:
        db.rollback()
        message = e.detail if isinstance(e, HTTPException) else str(e)
        _finish_dwc_job_failed(job.jobId, f"No se pudo recibir el archivo: {message}")
        _cleanup_dwc_job_file(job.jobId, file_path)
        if isinstance(e, HTTPException):
            raise
        if not isinstance(e, Exception):
            raise
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo recibir el archivo CSV.",
        ) from e
    finally:
        await file.close()

    background_tasks.add_task(
        process_dwc_csv_background,
        file_path,
        job.jobId,
        collection.collectionId,
        current_user.userId,
    )
    return {
        "status": "accepted",
        "detail": "CSV recibido. La importación continuará en segundo plano.",
        "jobId": job.jobId,
    }


def process_dwc_csv_background(
    file_path: str, job_id: UUID, collection_id: UUID, uploader_user_id: UUID
) -> None:
    """Validate and atomically import a DwC CSV while publishing independent progress updates."""
    now = datetime.utcnow()
    _commit_dwc_job_update(
        job_id,
        status=ImportJobStatus.RUNNING,
        stage="Validando CSV",
        detail="Validando encabezados y contando las filas del archivo.",
        startedAt=now,
        progressPercent=0.0,
    )

    db: Optional[Session] = None
    try:
        db = SessionLocal()
        collection = db.get(Collection, collection_id)
        current_user = db.get(User, uploader_user_id)
        if collection is None or current_user is None:
            raise ValueError("No se encontró la colección o el usuario que inició la importación.")

        encoding, total_rows = _inspect_dwc_csv(file_path)
        _commit_dwc_job_update(
            job_id,
            stage="Importando ocurrencias",
            detail="CSV validado. Insertando ocurrencias de forma atómica.",
            totalRows=total_rows,
            rowsProcessed=0,
            progressPercent=0.0,
        )

        publish_progress = _make_dwc_progress_publisher(job_id, total_rows)

        with open(file_path, "rb") as binary_file:
            with io.TextIOWrapper(binary_file, encoding=encoding, newline="") as text_file:
                _process_dwc_csv(
                    db,
                    collection,
                    text_file,
                    current_user,
                    job_id=job_id,
                    total_rows=total_rows,
                    progress_callback=publish_progress,
                )
    except HTTPException as e:
        if db is not None:
            db.rollback()
        _finish_dwc_job_failed(job_id, str(e.detail))
        logger.info("Importación DwC %s rechazada: %s", job_id, e.detail)
    except Exception as e:
        if db is not None:
            db.rollback()
        _finish_dwc_job_failed(job_id, str(e))
        logger.exception("Error procesando importación DwC %s", job_id)
    finally:
        try:
            if db is not None:
                db.close()
        finally:
            _cleanup_dwc_job_file(job_id, file_path)


def list_dwc_import_jobs(
    db: Session, collection_id: UUID, page: int, page_size: int, current_user: User
) -> Page[DwcImportJobOut]:
    collection = db.get(Collection, collection_id)
    if collection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    if not user_can_edit_collection(db, current_user, collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    limit = page_size
    offset = (page - 1) * page_size
    base_query = (
        select(DwcImportJob)
        .where(DwcImportJob.collectionId == collection_id)
        .order_by(DwcImportJob.createdAt.desc())
    )
    total = db.scalar(select(func.count()).select_from(base_query.subquery())) or 0
    jobs = db.scalars(base_query.limit(limit).offset(offset)).all()
    return Page[DwcImportJobOut].of(jobs, total=total, limit=limit, offset=offset)


def get_dwc_import_job(db: Session, job_id: UUID, current_user: User) -> DwcImportJob:
    job = db.get(DwcImportJob, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trabajo de importación no encontrado.",
        )
    collection = db.get(Collection, job.collectionId)
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colección de la importación no encontrada.",
        )
    if not user_can_edit_collection(db, current_user, collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return job


# =========================
# Caso de uso: import CSV DwC
# =========================


def import_dwc_csv(db: Session, collection_id: UUID, file: UploadFile, current_user: User) -> dict:
    job: Optional[DwcImportJob] = None
    try:
        # -------- Validaciones básicas de archivo --------
        original_filename = (
            (file.filename or "occurrences.csv").replace("\\", "/").rsplit("/", 1)[-1]
        )
        if not original_filename.lower().endswith(".csv"):
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

        job = _reserve_dwc_import_job(
            db,
            collection,
            current_user,
            original_filename,
            stage="Importando ocurrencias",
            detail="Importando el CSV en una transacción atómica.",
        )
        _commit_dwc_job_update(
            job.jobId,
            status=ImportJobStatus.RUNNING,
            stage="Importando ocurrencias",
            detail="Importando el CSV en una transacción atómica.",
            startedAt=datetime.utcnow(),
            fileSizeBytes=getattr(file, "size", None),
        )

        encoding = _detect_csv_encoding(file.file)
        with io.TextIOWrapper(file.file, encoding=encoding, newline="") as text_file:
            return _process_dwc_csv(
                db,
                collection,
                text_file,
                current_user,
                job_id=job.jobId,
                progress_callback=_make_dwc_progress_publisher(job.jobId, None),
            )
    except HTTPException as e:
        db.rollback()
        if job is not None:
            _finish_dwc_job_failed(job.jobId, str(e.detail))
        raise
    except Exception as e:
        db.rollback()
        if job is not None:
            _finish_dwc_job_failed(job.jobId, str(e))
        raise
    finally:
        file.file.close()
        if job is not None:
            _cleanup_dwc_job_file(job.jobId, None)


def _process_dwc_csv(
    db: Session,
    collection: Collection,
    text_file: TextIO,
    current_user: User,
    *,
    job_id: Optional[UUID] = None,
    total_rows: Optional[int] = None,
    progress_callback: Optional[Callable[[Dict[str, int], bool, str], None]] = None,
) -> dict:
    reader = csv.reader(text_file, strict=True)
    headers, colmap = _validate_dwc_csv_headers(reader)

    # -------- Caches de corrida y stats --------
    taxon_cache: OrderedDict[Tuple[str, str], Optional[UUID]] = OrderedDict()
    taxon_cache_size = 4096
    stats = {
        "rows": 0,
        "occurrencesInserted": 0,
        "taxaMatched": 0,
        "taxaUnmatched": 0,
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
            names_list = _split_list(identified_by_text)

            # -------- Resolver Taxon (no se crean taxones nuevos) --------
            # Lógica: solo asignar taxonId si se puede resolver un TAXON ÚNICO.
            # Sin scientificName, el resolver devuelve None.
            tkey = _taxon_key(sci_name, sci_auth)

            if tkey in taxon_cache:
                taxon_cache.move_to_end(tkey)
            else:
                taxon_obj = _resolve_unique_taxon_for_identification(db, sci_name, sci_auth)
                taxon_cache[tkey] = taxon_obj.taxonId if taxon_obj is not None else None
                if len(taxon_cache) > taxon_cache_size:
                    taxon_cache.popitem(last=False)

            taxon_id = taxon_cache[tkey]

            if taxon_id is not None:
                stats["taxaMatched"] += 1
            else:
                stats["taxaUnmatched"] += 1

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
            for name in names_list:
                db.add(
                    Identifier(
                        identificationId=identification_obj.identificationId,
                        fullName=name,
                    )
                )
                stats["identifiersInserted"] += 1

            if progress_callback is not None:
                progress_callback(stats, False, "Importando ocurrencias")

        if progress_callback is not None:
            progress_callback(stats, True, "Guardando cambios")
        if job_id is not None:
            db.execute(
                update(DwcImportJob)
                .where(DwcImportJob.jobId == job_id)
                .values(
                    status=ImportJobStatus.COMPLETED,
                    stage="Completado",
                    detail="La importación terminó correctamente.",
                    errorMessage=None,
                    rowsProcessed=stats["rows"],
                    totalRows=total_rows if total_rows is not None else stats["rows"],
                    progressPercent=100.0,
                    occurrencesInserted=stats["occurrencesInserted"],
                    taxaMatched=stats["taxaMatched"],
                    taxaUnmatched=stats["taxaUnmatched"],
                    identificationsInserted=stats["identificationsInserted"],
                    identifiersInserted=stats["identifiersInserted"],
                    finishedAt=datetime.utcnow(),
                    activeInstitutionId=None,
                )
            )
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
