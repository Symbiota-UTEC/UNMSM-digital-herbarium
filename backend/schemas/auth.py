from uuid import UUID
# backend/schemas/auth.py
from datetime import datetime
from typing import Optional, Literal

from pydantic import EmailStr

from backend.schemas.common.base import ORMBaseModel, StrictBaseModel


class RegistrationRequestItem(ORMBaseModel):
    registrationRequestId: UUID
    username: str
    email: EmailStr

    institutionId: UUID
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
    reviewedByUserId: Optional[UUID] = None
    resultingUserId: Optional[UUID] = None


class UpdateRequestStatusBody(StrictBaseModel):
    registrationRequestId: UUID
    newStatus: Literal["approved", "rejected"]
