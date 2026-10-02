from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field

from backend.schemas.common.base import StrictBaseModel


class TaxonFloraUploadAcceptedOut(StrictBaseModel):
    status: str
    backbone: str
    filename: str
    detail: str
    jobId: UUID


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
