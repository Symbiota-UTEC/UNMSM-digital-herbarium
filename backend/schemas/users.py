from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from backend.schemas.common.base import ORMBaseModel


class UserOut(ORMBaseModel):
    userId: UUID
    username: str
    email: str
    isActive: bool
    isSuperuser: bool
    isInstitutionAdmin: bool
    institutionId: UUID
    createdAt: datetime


class UserLookupResponse(ORMBaseModel):
    found: bool
    sameInstitution: Optional[bool] = None
    visibility: Literal["full", "limited", "none"]
    user: Optional[UserOut] = None
    message: Optional[str] = None
