from uuid import UUID
# backend/schemas/collections.py
from typing import Optional, Literal
from pydantic import EmailStr

from backend.schemas.common.base import ORMBaseModel, StrictBaseModel


class InstitutionOut(ORMBaseModel):
    institutionId: UUID
    institutionName: Optional[str] = None


class UserSummaryOut(ORMBaseModel):
    userId: UUID
    username: str
    email: EmailStr
    fullName: Optional[str] = None


class CollectionOut(ORMBaseModel):
    collectionId: UUID
    collectionName: Optional[str] = None
    description: Optional[str] = None
    institution: Optional[InstitutionOut] = None
    creator: UserSummaryOut
    myRole: Optional[str] = None
    occurrencesCount: int = 0


class CollectionCreate(StrictBaseModel):
    collectionName: Optional[str] = None
    description: Optional[str] = None
    institutionId: Optional[UUID] = None
    creatorUserId: UUID


class CollectionAccessUser(ORMBaseModel):
    fullName: str
    email: EmailStr
    institution: Optional[str] = None
    role: Literal["viewer", "editor", "owner"]


class AddUserToCollectionBody(StrictBaseModel):
    email: EmailStr
    role: Literal["viewer", "editor"] = "viewer"


class CollectionPermissionOut(ORMBaseModel):
    collectionId: UUID
    userId: UUID
    email: EmailStr
    role: str
