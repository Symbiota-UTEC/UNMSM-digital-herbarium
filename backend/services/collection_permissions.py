# backend/services/collection_permissions.py
"""
Reglas de autorización sobre `Collection`, en un único lugar (no reimplementar
en un router ni en el frontend). Tres niveles, de menor a mayor privilegio:

- ver: la colección y sus ocurrencias.
- editar: crear/editar ocurrencias.
- gestionar: administrar accesos y la colección (más estricto que editar:
  requiere rol 'owner', 'editor' no alcanza).

`collection_capabilities` es la fuente de verdad (función pura, sin consultas);
`user_can_*` la envuelven resolviendo el rol explícito, y la API la expone al
cliente como `canEdit`/`canManage` para que la interfaz no duplique estas reglas.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from backend.models.enums import CollectionRole, EffectiveRole
from backend.models.models import Collection, CollectionPermission, Occurrence, User


@dataclass(frozen=True)
class CollectionCapabilities:
    can_view: bool
    can_edit: bool
    can_manage: bool


def _same_institution(user: User, collection: Collection) -> bool:
    return (
        collection.institutionId is not None
        and user.institutionId is not None
        and collection.institutionId == user.institutionId
    )


def collection_capabilities(
    user: User, collection: Collection, role: Optional[CollectionRole]
) -> CollectionCapabilities:
    """
    Qué puede hacer `user` en `collection`, dado su rol explícito (`viewer`/`editor`/`owner`).

    - superuser: todo.
    - admin de institución de la misma institución: todo.
    - rol explícito: ver (cualquiera), editar (editor/owner).
    - gestionar: 'owner'; un admin de institución sólo gestiona las de su propia
      institución (sin fallback a un rol explícito).
    """
    if user.isSuperuser:
        return CollectionCapabilities(True, True, True)

    institution_admin_here = user.isInstitutionAdmin and _same_institution(user, collection)
    return CollectionCapabilities(
        can_view=institution_admin_here or role is not None,
        can_edit=institution_admin_here or role in (CollectionRole.EDITOR, CollectionRole.OWNER),
        can_manage=institution_admin_here
        if user.isInstitutionAdmin
        else role == CollectionRole.OWNER,
    )


def my_role_label(
    user: User, collection: Collection, role: Optional[CollectionRole]
) -> Optional[EffectiveRole]:
    """Rol que se muestra al cliente en `myRole`."""
    if user.isSuperuser:
        return EffectiveRole.SUPERUSER
    if role:
        return EffectiveRole(getattr(role, "value", role))
    if user.isInstitutionAdmin and user.institutionId == collection.institutionId:
        return EffectiveRole.INSTITUTION_ADMIN
    return None


def get_user_role_in_collection(
    db: Session, collection_id: UUID, user_id: UUID
) -> Optional[CollectionRole]:
    """Rol explícito del usuario en la colección, si tiene alguno."""
    return db.scalar(
        select(CollectionPermission.role).where(
            (CollectionPermission.collectionId == collection_id)
            & (CollectionPermission.userId == user_id)
        )
    )


def _capabilities(db: Session, user: User, collection: Collection) -> CollectionCapabilities:
    role = (
        None
        if user.isSuperuser
        else get_user_role_in_collection(db, collection.collectionId, user.userId)
    )
    return collection_capabilities(user, collection, role)


def user_can_view_collection(db: Session, user: User, collection: Collection) -> bool:
    return _capabilities(db, user, collection).can_view


def user_can_edit_collection(db: Session, user: User, collection: Collection) -> bool:
    return _capabilities(db, user, collection).can_edit


def user_can_manage_collection_permissions(db: Session, user: User, collection: Collection) -> bool:
    return _capabilities(db, user, collection).can_manage


def visible_occurrences_condition(user: User) -> Optional[ColumnElement[bool]]:
    """Condición SQLAlchemy que limita `Occurrence` a las visibles para `user`: sin filtro
    (None) si es superuser; si no, las de colecciones con un `CollectionPermission` explícito
    más -si es admin de institución- las de su propia institución. Comparte la regla de
    `_visible_occurrences_select` en services/occurrences.py; cualquier query nueva sobre
    Occurrence que dependa de quién puede verla debe usar esta función en vez de reimplementar
    la lógica. Requiere que el SELECT ya haga
    `.join(Collection, Occurrence.collectionId == Collection.collectionId)` (el caso de admin
    de institución compara `Collection.institutionId`)."""
    if user.isSuperuser:
        return None

    perm_subq = select(CollectionPermission.collectionId).where(
        CollectionPermission.userId == user.userId,
        CollectionPermission.role.in_(list(CollectionRole)),
    )
    conds = [Occurrence.collectionId.in_(perm_subq)]
    if user.isInstitutionAdmin and user.institutionId:
        conds.append(Collection.institutionId == user.institutionId)
    return or_(*conds)
