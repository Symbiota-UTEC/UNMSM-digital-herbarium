# backend/schemas/collections.py
from typing import Literal, Optional
from uuid import UUID

from pydantic import EmailStr

from backend.models.enums import CollectionRole, EffectiveRole
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
    myRole: Optional[EffectiveRole] = None
    # Qué puede hacer el usuario actual (calculado en el servidor; el cliente no debe deducirlo)
    canEdit: bool = False  # crear/editar ocurrencias, importar CSV
    canManage: bool = False  # gestionar accesos y la colección
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
    role: CollectionRole


class AddUserToCollectionBody(StrictBaseModel):
    email: EmailStr
    role: Literal[CollectionRole.VIEWER, CollectionRole.EDITOR] = CollectionRole.VIEWER


class CollectionPermissionOut(ORMBaseModel):
    collectionId: UUID
    userId: UUID
    email: EmailStr
    role: str
