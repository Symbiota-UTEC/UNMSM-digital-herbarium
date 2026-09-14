from __future__ import annotations
# backend/services/collection_permissions.py
"""
Reglas de autorización sobre `Collection`, en un único lugar (no reimplementar
en un router). Tres niveles, de menor a mayor privilegio:

- `user_can_view_collection`: ver la colección y sus ocurrencias.
- `user_can_edit_collection`: crear/editar ocurrencias.
- `user_can_manage_collection_permissions`: gestionar accesos (más estricto
  que editar: requiere rol 'owner', 'editor' no alcanza).
"""

from typing import Optional
from uuid import UUID

from sqlalchemy import select, exists
from sqlalchemy.orm import Session

from backend.models.models import Collection, CollectionPermission, User


def _same_institution(user: User, collection: Collection) -> bool:
    return (
        collection.institutionId is not None
        and user.institutionId is not None
        and collection.institutionId == user.institutionId
    )


def get_user_role_in_collection(
    db: Session, collection_id: UUID, user_id: UUID
) -> Optional[str]:
    """Rol explícito (`viewer`/`editor`/`owner`) del usuario en la colección, si tiene alguno."""
    return db.scalar(
        select(CollectionPermission.role).where(
            (CollectionPermission.collectionId == collection_id)
            & (CollectionPermission.userId == user_id)
        )
    )


def user_can_view_collection(db: Session, user: User, collection: Collection) -> bool:
    """
    Reglas:
       - superuser: acceso
       - permiso explícito (viewer/editor/owner): acceso
       - admin de institución y misma institución: acceso
    """
    if user.isSuperuser:
        return True

    if user.isInstitutionAdmin and _same_institution(user, collection):
        return True

    perm_exists = db.scalar(
        select(
            exists().where(
                (CollectionPermission.collectionId == collection.collectionId)
                & (CollectionPermission.userId == user.userId)
            )
        )
    )
    return bool(perm_exists)


def user_can_edit_collection(db: Session, user: User, collection: Collection) -> bool:
    """
    Permisos de edición:
       - superuser
       - admin de la institución dueña
       - rol explícito editor/owner
    """
    if user.isSuperuser:
        return True

    if user.isInstitutionAdmin and _same_institution(user, collection):
        return True

    role = get_user_role_in_collection(db, collection.collectionId, user.userId)
    return role in ("editor", "owner")


def user_can_manage_collection_permissions(
    db: Session, user: User, collection: Collection
) -> bool:
    """
    Permisos para administrar accesos de la colección (agregar/quitar usuarios):
       - superuser: acceso.
       - admin de institución: acceso sólo si la colección es de su propia
         institución (sin fallback a un permiso explícito, a diferencia de
         `user_can_view_collection`/`user_can_edit_collection`).
       - cualquier otro usuario: sólo con rol explícito 'owner'.
    """
    if user.isSuperuser:
        return True

    if user.isInstitutionAdmin:
        return _same_institution(user, collection)

    role = get_user_role_in_collection(db, collection.collectionId, user.userId)
    return role == "owner"
