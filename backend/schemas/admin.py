from uuid import UUID
from typing import Dict, Literal, Optional

from pydantic import BaseModel

MetricKey = Literal["collections", "users", "occurrences", "requestsPending"]


class ScopedTotals(BaseModel):
    institution: int
    app: Optional[int] = None


class AdminMetricsOut(BaseModel):
    institutionId: UUID
    metrics: Dict[MetricKey, ScopedTotals]
