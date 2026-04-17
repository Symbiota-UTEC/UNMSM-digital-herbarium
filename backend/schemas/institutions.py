from uuid import UUID
from typing import Optional

from pydantic import EmailStr

from backend.schemas.common.base import ORMBaseModel, StrictBaseModel


class AdminUserOut(ORMBaseModel):
    userId: UUID
    username: str
    email: EmailStr
    fullName: Optional[str] = None


class InstitutionOut(ORMBaseModel):
    institutionId: UUID
    institutionName: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

    institutionAdminUserId: Optional[UUID] = None
    usersCount: int = 0

    institutionAdminUser: Optional[AdminUserOut] = None


class InstitutionBase(StrictBaseModel):
    institutionName: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    webSite: Optional[str] = None
    institutionAdminUserId: Optional[UUID] = None


class InstitutionCreate(InstitutionBase):
    institutionName: str


class InstitutionUpdate(InstitutionBase):
    pass
