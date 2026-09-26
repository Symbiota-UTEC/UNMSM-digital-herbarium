from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.auth.jwt import get_current_user
from backend.config.database import get_db
from backend.models.models import User
from backend.schemas.common.pages import Page
from backend.schemas.users import UserLookupResponse, UserOut
from backend.services import users as users_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/by-email",
    response_model=UserLookupResponse,
    summary="Get user by email with role-aware visibility",
)
def get_user_by_email(
    email: str = Query(...),
    institution_id: Optional[UUID] = None,  # opcional; no otorga privilegios
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return users_service.get_user_by_email(db, email, institution_id, current_user)


@router.get("/{user_id}", response_model=UserOut, summary="Get user by id")
def get_user_by_id(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return users_service.get_user_by_id(db, user_id, current_user)


@router.get(
    "/",
    response_model=Page[UserOut],
    summary="Get users with optional institution filter and pagination",
)
def get_users(
    institution_id: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1, description="Número de página (1-based)"),
    page_size: int = Query(100, ge=1, le=500, alias="pageSize", description="Tamaño de página"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return users_service.get_users(db, institution_id, page, page_size, current_user)
