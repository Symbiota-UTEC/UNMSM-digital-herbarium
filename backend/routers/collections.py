# backend/routers/collections.py
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.auth.jwt import get_current_user
from backend.config.database import get_db
from backend.models.enums import CollectionAccess, CollectionRole
from backend.models.models import User
from backend.schemas.collections import (
    AddUserToCollectionBody,
    CollectionAccessUser,
    CollectionCreate,
    CollectionOut,
    CollectionPermissionOut,
)
from backend.schemas.common.pages import Page
from backend.schemas.occurrence import OccurrenceBriefItem
from backend.services import collections as collections_service

router = APIRouter(prefix="/collections", tags=["Collections"])


@router.get(
    "",
    response_model=Page[CollectionOut],
    summary="Listar colecciones del usuario actual filtradas por tipo de acceso",
)
def get_collections(
    access: CollectionAccess = Query(
        CollectionAccess.ALLOWED,
        description=(
            "'owner': colecciones creadas por el usuario actual. "
            "'allowed': colecciones a las que el usuario tiene acceso "
            "(superuser: todas; institution admin: las de su institución; "
            "usuario normal: permisos explícitos)."
        ),
    ),
    page: int = Query(1, ge=1, description="Número de página (1-based)"),
    page_size: int = Query(20, ge=1, le=200, alias="pageSize", description="Tamaño de página"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collections_service.get_collections(db, access, page, page_size, current_user)


@router.post(
    "",
    response_model=CollectionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una colección (requiere usuario activo)",
)
def create_collection(
    payload: CollectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collections_service.create_collection(db, payload, current_user)


@router.get(
    "/{collection_id}",
    response_model=CollectionOut,
    summary="Detalle de una colección, con lo que el usuario actual puede hacer en ella",
)
def get_collection(
    collection_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collections_service.get_collection(db, collection_id, current_user)


@router.get(
    "/{collection_id}/access-users",
    response_model=Page[CollectionAccessUser],
    summary="Usuarios con acceso a una colección (paginado)",
)
def list_collection_access_users(
    collection_id: UUID,
    q: Optional[str] = Query(None, description="Texto a buscar en nombre o correo"),
    role: Optional[CollectionRole] = Query(None, description="Filtrar por rol exacto"),
    page: int = Query(1, ge=1, description="Número de página (1-based)"),
    page_size: int = Query(50, ge=1, le=500, alias="pageSize", description="Tamaño de página"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collections_service.list_collection_access_users(
        db, collection_id, q, role, page, page_size, current_user
    )


@router.get(
    "/{collection_id}/occurrences/brief",
    response_model=Page[OccurrenceBriefItem],
    summary="Ocurrencias por ID de colección (breve, paginado)",
)
def list_occurrences_brief_by_collection_id(
    collection_id: UUID,
    q: Optional[str] = Query(
        None,
        description=("Buscar en código, nombre científico, familia, ubicación o recolector"),
    ),
    page: int = Query(1, ge=1, description="Número de página (1-based)"),
    page_size: int = Query(50, ge=1, le=500, alias="pageSize", description="Tamaño de página"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collections_service.list_occurrences_brief_by_collection_id(
        db, collection_id, q, page, page_size, current_user
    )


@router.post(
    "/{collection_id}/permissions/add-user",
    response_model=CollectionPermissionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar usuario (por email) a una colección con rol viewer/editor",
)
def add_user_to_collection(
    collection_id: UUID,
    payload: AddUserToCollectionBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return collections_service.add_user_to_collection(db, collection_id, payload, current_user)
