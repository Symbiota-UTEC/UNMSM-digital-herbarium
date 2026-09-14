from __future__ import annotations
from uuid import UUID
# backend/routers/upload/taxon_flora.py

import csv
import logging
import os
import tempfile

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status, BackgroundTasks
from sqlalchemy import func, select, update, text
from sqlalchemy.orm import Session
from sqlalchemy.inspection import inspect
from datetime import datetime

from backend.config.database import get_db, SessionLocal
from backend.auth.jwt import require_superuser
from backend.models.models import User, Taxon, TaxonFloraImportJob
from backend.schemas.common.pages import Page
from backend.schemas.upload import (
    TaxonFloraImportJobOut,
    TaxonFloraUploadAcceptedOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Files"])


# ----------------------------
# Helpers de progreso del job
# ----------------------------

def _utcnow() -> datetime:
    return datetime.utcnow()


def _calculate_progress_metrics(
    *,
    file_size_bytes: Optional[int],
    bytes_processed: Optional[int],
    started_at: Optional[datetime],
) -> tuple[Optional[float], Optional[int]]:
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

            delimiter = "\t" if b"\t" in sample else ","
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

            reader = csv.reader(decoded_lines(bin_file, encoding), delimiter=delimiter)
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
    response_model=Page[TaxonFloraImportJobOut],
    summary="Lista los trabajos de importación del backbone Taxon (paginado).",
)
def list_taxon_flora_import_jobs(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    del current_user

    base_q = select(TaxonFloraImportJob).order_by(TaxonFloraImportJob.createdAt.desc())
    total = db.scalar(select(func.count()).select_from(base_q.subquery()))
    jobs = db.scalars(base_q.limit(limit).offset(offset)).all()

    return Page[TaxonFloraImportJobOut].of(jobs, total=total, limit=limit, offset=offset)


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
