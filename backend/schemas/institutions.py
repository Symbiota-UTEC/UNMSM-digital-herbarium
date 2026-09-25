from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import EmailStr, field_validator

from backend.schemas.common.base import ORMBaseModel, StrictBaseModel
from backend.utils.catalog import normalize_institution_code


class AdminUserOut(ORMBaseModel):
    userId: UUID
    username: str
    email: EmailStr
    fullName: Optional[str] = None


class InstitutionOut(ORMBaseModel):
    institutionId: UUID
    institutionCode: str
    institutionName: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

    institutionAdminUserId: Optional[UUID] = None
    usersCount: int = 0

    institutionAdminUser: Optional[AdminUserOut] = None

    createdAt: datetime
    updatedAt: datetime


class InstitutionBase(StrictBaseModel):
    institutionName: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    webSite: Optional[str] = None
    institutionAdminUserId: Optional[UUID] = None

    @field_validator("institutionCode", check_fields=False)
    @classmethod
    def validate_institution_code(cls, value: str) -> str:
        return normalize_institution_code(value)


class InstitutionCreate(InstitutionBase):
    institutionName: str
    institutionCode: str


class InstitutionUpdate(InstitutionBase):
    institutionCode: Optional[str] = None
