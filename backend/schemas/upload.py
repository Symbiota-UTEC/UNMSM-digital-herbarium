from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional
from uuid import UUID

from pydantic import Field, field_serializer

from backend.schemas.common.base import StrictBaseModel


class TaxonFloraUploadAcceptedOut(StrictBaseModel):
    status: str
    backbone: str
    filename: str
    detail: str
    jobId: UUID


class DwcImportJobAcceptedOut(StrictBaseModel):
    status: str
    detail: str
    jobId: UUID


class DwcImportJobOut(StrictBaseModel):
    jobId: UUID
    collectionId: UUID
    filename: str
    status: str
    stage: str
    detail: Optional[str] = None
    errorMessage: Optional[str] = None
    fileSizeBytes: Optional[int] = None
    totalRows: Optional[int] = None
    rowsProcessed: int
    progressPercent: Optional[float] = None
    occurrencesInserted: int
    taxaMatched: int
    taxaUnmatched: int
    identificationsInserted: int
    identifiersInserted: int
    createdAt: datetime
    startedAt: Optional[datetime] = None
    finishedAt: Optional[datetime] = None

    @field_serializer("createdAt", "startedAt", "finishedAt", when_used="json")
    def serialize_utc_timestamp(self, value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        # Database timestamps are stored as naive UTC values.
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class TaxonFloraImportJobOut(StrictBaseModel):
    jobId: UUID
    filename: str
    status: str
    stage: Optional[str] = None
    detail: Optional[str] = None
    errorMessage: Optional[str] = None
    fileSizeBytes: Optional[int] = None
    bytesProcessed: Optional[int] = None
    progressPercent: Optional[float] = None
    estimatedSecondsRemaining: Optional[int] = Field(
        default=None,
        description=(
            "Estimated seconds remaining in the current import stage; null when the stage "
            "does not yet have enough measured progress."
        ),
    )
    rowsProcessed: int
    rowsFilteredOut: int
    taxaMarkedNotCurrent: int
    taxaInserted: int
    taxaUpdated: int
    taxaSetCurrent: int
    lastProcessedRow: Optional[int] = None
    createdAt: datetime
    startedAt: Optional[datetime] = None
    finishedAt: Optional[datetime] = None
    uploadedByUserId: Optional[UUID] = None
