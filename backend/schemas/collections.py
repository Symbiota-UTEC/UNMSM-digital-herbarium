# backend/schemas/collections.py
from typing import Optional, Literal
from pydantic import EmailStr

from backend.schemas.common.base import ORMBaseModel, StrictBaseModel


class InstitutionOut(ORMBaseModel):
    id: int
    institutionCode: Optional[str] = None
    institutionName: Optional[str] = None


class UserSummaryOut(ORMBaseModel):
    id: int
    username: str
    email: EmailStr
    fullName: Optional[str] = None


class CollectionOut(ORMBaseModel):
    id: int
    collectionCode: Optional[str] = None
    collectionName: Optional[str] = None
    description: Optional[str] = None
    institution: Optional[InstitutionOut] = None
    creator: UserSummaryOut
    myRole: Optional[str] = None
    occurrencesCount: int = 0


class CollectionCreate(StrictBaseModel):
    collectionCode: Optional[str] = None
    collectionName: Optional[str] = None
    description: Optional[str] = None
    institutionId: Optional[int] = None
    creatorUserId: int


class CollectionAccessUser(ORMBaseModel):
    fullName: str
    email: EmailStr
    institution: Optional[str] = None
    role: Literal["viewer", "editor", "owner"]


class AddUserToCollectionBody(StrictBaseModel):
    email: EmailStr
    role: Literal["viewer", "editor"] = "viewer"


class CollectionPermissionOut(ORMBaseModel):
    collectionId: int
    userId: int
    email: EmailStr
    role: str
