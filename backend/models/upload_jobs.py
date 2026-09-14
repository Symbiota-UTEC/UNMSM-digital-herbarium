"""Modelo: TaxonFloraImportJob (seguimiento de importaciones async del backbone Taxon)."""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import String, Text, Integer, BigInteger, Float, DateTime, ForeignKey, Index, Enum, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from backend.config.database import Base
from datetime import datetime


class TaxonFloraImportJob(Base):
    __tablename__ = "taxon_flora_import_job"

    jobId: Mapped[uuid.UUID] = mapped_column(
        "job_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    filename: Mapped[str] = mapped_column("filename", String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        "status",
        Enum(
            "queued",
            "running",
            "completed",
            "failed",
            name="taxon_flora_import_job_status_enum",
        ),
        nullable=False,
        default="queued",
        index=True,
    )
    stage: Mapped[Optional[str]] = mapped_column("stage", String(255), nullable=True)
    detail: Mapped[Optional[str]] = mapped_column("detail", Text(), nullable=True)
    errorMessage: Mapped[Optional[str]] = mapped_column(
        "error_message", Text(), nullable=True
    )

    fileSizeBytes: Mapped[Optional[int]] = mapped_column(
        "file_size_bytes", BigInteger, nullable=True
    )
    bytesProcessed: Mapped[Optional[int]] = mapped_column(
        "bytes_processed", BigInteger, nullable=True
    )
    progressPercent: Mapped[Optional[float]] = mapped_column(
        "progress_percent", Float, nullable=True
    )
    estimatedSecondsRemaining: Mapped[Optional[int]] = mapped_column(
        "estimated_seconds_remaining", Integer, nullable=True
    )

    rowsProcessed: Mapped[int] = mapped_column(
        "rows_processed", Integer, nullable=False, default=0, server_default="0"
    )
    rowsFilteredOut: Mapped[int] = mapped_column(
        "rows_filtered_out", Integer, nullable=False, default=0, server_default="0"
    )
    taxaMarkedNotCurrent: Mapped[int] = mapped_column(
        "taxa_marked_not_current", Integer, nullable=False, default=0, server_default="0"
    )
    taxaInserted: Mapped[int] = mapped_column(
        "taxa_inserted", Integer, nullable=False, default=0, server_default="0"
    )
    taxaUpdated: Mapped[int] = mapped_column(
        "taxa_updated", Integer, nullable=False, default=0, server_default="0"
    )
    taxaSetCurrent: Mapped[int] = mapped_column(
        "taxa_set_current", Integer, nullable=False, default=0, server_default="0"
    )
    lastProcessedRow: Mapped[Optional[int]] = mapped_column(
        "last_processed_row", Integer, nullable=True
    )

    createdAt: Mapped[datetime] = mapped_column(
        "created_at", DateTime, nullable=False, default=datetime.utcnow, index=True
    )
    startedAt: Mapped[Optional[datetime]] = mapped_column(
        "started_at", DateTime, nullable=True
    )
    finishedAt: Mapped[Optional[datetime]] = mapped_column(
        "finished_at", DateTime, nullable=True
    )
    uploadedByUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "uploaded_by_user_id", ForeignKey("users.user_id"), nullable=True, index=True
    )

    __table_args__ = (
        Index("ix_taxon_flora_import_job_created_status", "created_at", "status"),
    )
