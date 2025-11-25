# backend/schemas/auth.py
from datetime import datetime
from typing import Optional, Literal

from pydantic import EmailStr

from backend.schemas.common.base import ORMBaseModel, StrictBaseModel


class RegistrationRequestItem(ORMBaseModel):
    id: int
    username: str
    email: EmailStr

    institutionId: int
    institutionName: Optional[str] = None

    fullName: Optional[str] = None
    givenName: Optional[str] = None
    familyName: Optional[str] = None
    orcid: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

    status: Literal["pending", "approved", "rejected"]
    createdAt: datetime
    reviewedAt: Optional[datetime] = None
    reviewedByUserId: Optional[int] = None
    resultingUserId: Optional[int] = None


class UpdateRequestStatusBody(StrictBaseModel):
    registrationRequestId: int
    newStatus: Literal["approved", "rejected"]
