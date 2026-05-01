from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

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
    estimatedSecondsRemaining: Optional[int] = None
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


class TaxonFloraImportJobListOut(StrictBaseModel):
    items: List[TaxonFloraImportJobOut]
