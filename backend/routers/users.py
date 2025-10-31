import math
from typing import List, Optional

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.config.database import get_db
from backend.models.models import User, Institution
from backend.auth.jwt import get_current_user

from pydantic import BaseModel


router = APIRouter(prefix="/users", tags=["Users"])


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    is_superuser: bool
    is_institution_admin: bool
    institution_id: int
    created_at: datetime

    class Config:
        orm_mode = True


class UserPaginationResponse(BaseModel):
    users: List[UserOut]
    total_users: int
    total_pages: int
    limit: int
    offset: int


@router.get("/{user_id}", response_model=UserOut, summary="Get user by id")
def get_user_by_id(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    if current_user.is_superuser:
        return user

    elif current_user.is_institution_admin:
        if current_user.institution_id != user.institution_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para acceder a este usuario",
            )
        return user

    elif current_user.id == user_id:
        return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permisos para acceder a este usuario",
    )


@router.get("/", response_model=UserPaginationResponse, summary="Get users with optional institution filter and pagination")
def get_users(
    institution_id: int = Query(None, ge=1),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Iniciar la consulta de usuarios (tanto activo como inactivos)
    stmt = select(User)

    # El superadmin no necesita mayor validacion
    if current_user.is_superuser:
        pass

    # Si el usuario es admin de la institución se filtra por su institución
    elif current_user.is_institution_admin:
        if not institution_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debes proporcionar un institution_id para consultar usuarios",
            )
        if institution_id != current_user.institution_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para acceder a los usuarios de esta institución",
            )
        stmt = stmt.where(User.institution_id == institution_id)  # Filtro para admin de institucion

    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para acceder a los usuarios",
        )

    stmt = stmt.limit(limit).offset(offset)

    users = db.scalars(stmt).all()

    total_users = db.execute(select(User)).scalar()

    # Numero de paginas
    total_pages = math.ceil(total_users / limit)

    return UserPaginationResponse(
        users=[UserOut(
            id=user.id,
            username=user.username,
            email=user.email,
            is_active=user.is_active,
            is_superuser=user.is_superuser,
            is_institution_admin=user.is_institution_admin,
            institution_id=user.institution_id,
            created_at=user.created_at,
        ) for user in users],
        total_users=total_users,
        total_pages=total_pages,
        limit=limit,
        offset=offset
    )
