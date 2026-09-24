# backend/services/taxon_flora_import.py
from __future__ import annotations

import csv
import io
import logging
import os
import tempfile
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException, UploadFile, status
from psycopg2 import sql
from sqlalchemy import func, select, text, update
from sqlalchemy.inspection import inspect
from sqlalchemy.orm import Session

from backend.config.database import SessionLocal
from backend.models.models import Taxon, TaxonFloraImportJob, User
from backend.schemas.common.pages import Page
from backend.schemas.upload import TaxonFloraImportJobOut

logger = logging.getLogger(__name__)

COPY_BATCH_SIZE = 10_000


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

    if started_at is None or bounded_bytes <= 0 or bounded_bytes >= file_size_bytes:
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
    clear_eta: bool = False,
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

    if clear_eta:
        values["estimatedSecondsRemaining"] = None
    elif force_eta_seconds is not None:
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
            update(TaxonFloraImportJob).where(TaxonFloraImportJob.jobId == job_id).values(**values)
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


def _merge_staged_taxa(db: Session, mapped_fields: List[str]) -> Dict[str, int]:
    """Merge the last CSV row for each WFO ID without replacing taxon UUIDs."""
    db.execute(
        text(
            "CREATE TEMP TABLE flora_taxon_latest ON COMMIT DROP AS "
            "SELECT DISTINCT ON (wfo_taxon_id) * FROM flora_taxon_stage "
            "ORDER BY wfo_taxon_id, source_row DESC"
        )
    )
    db.execute(text("CREATE UNIQUE INDEX ON flora_taxon_latest (wfo_taxon_id)"))
    db.execute(text("ANALYZE flora_taxon_latest"))

    current_count = db.scalar(text("SELECT count(*) FROM flora_taxon_latest")) or 0
    if not current_count:
        raise ValueError(
            "El CSV no contiene ningún taxonID válido; el backbone anterior sigue intacto."
        )

    mapper = inspect(Taxon)
    quote = db.get_bind().dialect.identifier_preparer.quote
    columns = [mapper.columns[field].name for field in mapped_fields if field != "wfoTaxonId"]
    target_values = [f"t.{quote(column)}" for column in columns] + ["t.is_current"]
    stage_values = [f"s.{quote(column)}" for column in columns] + ["TRUE"]
    changed_from_stage = (
        f"ROW({', '.join(target_values)}) IS DISTINCT FROM ROW({', '.join(stage_values)})"
    )

    inserted, updated = db.execute(
        text(
            "SELECT "
            "count(*) FILTER (WHERE t.taxon_id IS NULL), "
            f"count(*) FILTER (WHERE t.taxon_id IS NOT NULL AND ({changed_from_stage})) "
            "FROM flora_taxon_latest AS s "
            "LEFT JOIN taxon AS t ON t.wfo_taxon_id = s.wfo_taxon_id"
        )
    ).one()

    insert_columns = ["taxon_id", "wfo_taxon_id", *columns, "is_current"]
    insert_names = ", ".join(quote(column) for column in insert_columns)
    selected_values = []
    for column in insert_columns:
        if column == "taxon_id":
            selected_values.append("gen_random_uuid()")
        elif column == "is_current":
            selected_values.append("TRUE")
        else:
            selected_values.append(f"s.{quote(column)}")
    insert_values = ", ".join(selected_values)
    assignments = ", ".join(
        [f"{quote(column)} = EXCLUDED.{quote(column)}" for column in columns]
        + ["is_current = TRUE"]
    )
    conflict_values = [f"EXCLUDED.{quote(column)}" for column in columns] + ["TRUE"]
    existing_values = [f"taxon.{quote(column)}" for column in columns] + ["taxon.is_current"]
    changed_from_excluded = (
        f"ROW({', '.join(existing_values)}) IS DISTINCT FROM ROW({', '.join(conflict_values)})"
    )
    db.execute(
        text(
            f"INSERT INTO taxon ({insert_names}) "
            f"SELECT {insert_values} FROM flora_taxon_latest AS s WHERE TRUE "
            "ON CONFLICT (wfo_taxon_id) DO UPDATE "
            f"SET {assignments} WHERE {changed_from_excluded}"
        )
    )

    deactivated = db.execute(
        text(
            "UPDATE taxon AS t SET is_current = FALSE "
            "WHERE t.is_current AND NOT EXISTS ("
            "SELECT 1 FROM flora_taxon_latest AS s WHERE s.wfo_taxon_id = t.wfo_taxon_id"
            ")"
        )
    ).rowcount
    return {
        "taxaInserted": inserted,
        "taxaUpdated": updated,
        "taxaSetCurrent": current_count,
        "taxaMarkedNotCurrent": deactivated,
    }


# =========================
# Procesamiento en background del backbone Taxon (flora)
# =========================


def process_taxon_flora_csv_background(
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

    def incomplete_percent(bytes_processed: Optional[int]) -> float:
        if not file_size_bytes or bytes_processed is None:
            return 0.0
        return min(round(bytes_processed / file_size_bytes * 99, 2), 99.0)

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
        clear_eta: bool = False,
    ) -> None:
        if status_value == "failed":
            force_percent = incomplete_percent(bytes_processed)
            clear_eta = True
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
            clear_eta=clear_eta,
        )

    def build_taxon_values(
        row: List[str],
        headers: List[str],
        header_index: Dict[str, int],
        mapped_fields: List[str],
    ) -> Optional[Dict[str, Any]]:
        if len(row) < len(headers):
            row = row + [""] * (len(headers) - len(row))

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
                            'Parche UTF-8 aplicado en línea con patrón \\xc2\\": %r',
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
                    error_message=("Faltan columnas requeridas: " + ", ".join(missing_filter_cols)),
                    bytes_processed=min(bin_file.tell(), file_size_bytes),
                    finished_at=_utcnow(),
                )
                return

            taxon_mapper = inspect(Taxon)
            model_attrs: set[str] = set(taxon_mapper.columns.keys())

            blocked_fields = {"id", "taxonId", "isCurrent"}
            updatable_fields = model_attrs - blocked_fields
            mapped_fields = list(
                dict.fromkeys(name for name in headers if name in updatable_fields)
            )

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

            try:
                with db.begin():
                    db.execute(
                        text("SELECT pg_advisory_xact_lock(:lock_id)"),
                        {"lock_id": 872341905},
                    )
                    db.execute(
                        text(
                            "CREATE TEMP TABLE flora_taxon_stage ("
                            "LIKE taxon INCLUDING DEFAULTS, "
                            "source_row BIGINT GENERATED ALWAYS AS IDENTITY"
                            ") ON COMMIT DROP"
                        )
                    )
                    db.execute(
                        text("ALTER TABLE flora_taxon_stage ALTER COLUMN taxon_id DROP NOT NULL")
                    )
                    mapper = inspect(Taxon)
                    copied_fields = [field for field in mapped_fields if field != "wfoTaxonId"]
                    copy_columns = [
                        "wfo_taxon_id",
                        *(mapper.columns[field].name for field in copied_fields),
                    ]
                    copy_query = sql.SQL(
                        "COPY flora_taxon_stage ({}) FROM STDIN WITH (FORMAT csv)"
                    ).format(sql.SQL(", ").join(map(sql.Identifier, copy_columns)))
                    raw_connection = db.connection().connection.driver_connection
                    batch_buffer = io.StringIO()
                    writer = csv.writer(batch_buffer, lineterminator="\n")
                    batch_rows = 0

                    def copy_batch(cursor) -> None:
                        nonlocal batch_buffer, writer, batch_rows
                        if not batch_rows:
                            return
                        batch_buffer.seek(0)
                        cursor.copy_expert(copy_query.as_string(cursor), batch_buffer)
                        batch_buffer = io.StringIO()
                        writer = csv.writer(batch_buffer, lineterminator="\n")
                        batch_rows = 0

                    publish_progress(
                        stage="Procesando filas",
                        detail="Importando taxones desde el CSV.",
                        bytes_processed=bin_file.tell(),
                        force_percent=incomplete_percent(bin_file.tell()),
                    )
                    with raw_connection.cursor() as cursor:
                        for row in reader:
                            row_number += 1
                            stats["rows"] += 1
                            field_values = build_taxon_values(
                                row,
                                headers,
                                header_index,
                                mapped_fields,
                            )
                            if field_values is None:
                                continue

                            writer.writerow(
                                [
                                    field_values["wfoTaxonId"],
                                    *(field_values[field] for field in copied_fields),
                                ]
                            )
                            batch_rows += 1
                            if batch_rows >= COPY_BATCH_SIZE:
                                copy_batch(cursor)
                                publish_progress(
                                    stage="Procesando filas",
                                    detail="Importando taxones desde el CSV.",
                                    bytes_processed=bin_file.tell(),
                                    force_percent=incomplete_percent(bin_file.tell()),
                                )
                        copy_batch(cursor)

                    publish_progress(
                        stage="Combinando taxones",
                        detail="Actualizando el backbone con los taxones del archivo.",
                        bytes_processed=file_size_bytes,
                        force_percent=99.0,
                        clear_eta=True,
                    )
                    stats.update(_merge_staged_taxa(db, mapped_fields))

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


# =========================
# Casos de uso (endpoints)
# =========================


def list_taxon_flora_import_jobs(
    db: Session, limit: int, offset: int
) -> Page[TaxonFloraImportJobOut]:
    base_q = select(TaxonFloraImportJob).order_by(TaxonFloraImportJob.createdAt.desc())
    total = db.scalar(select(func.count()).select_from(base_q.subquery()))
    jobs = db.scalars(base_q.limit(limit).offset(offset)).all()

    return Page[TaxonFloraImportJobOut].of(jobs, total=total, limit=limit, offset=offset)


def get_taxon_flora_import_job(db: Session, job_id: UUID) -> TaxonFloraImportJob:
    job = db.get(TaxonFloraImportJob, job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trabajo de importación no encontrado.",
        )

    return job


async def upload_taxon_flora_csv(
    db: Session,
    background_tasks: BackgroundTasks,
    file: UploadFile,
    current_user: User,
) -> dict:
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
        process_taxon_flora_csv_background,
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
