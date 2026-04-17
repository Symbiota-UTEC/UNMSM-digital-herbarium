from uuid import UUID
import math
from typing import List, Optional, Literal

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from backend.config.database import get_db
from backend.models.models import User, Institution
from backend.auth.jwt import get_current_user

from backend.schemas.common.pages import Page

from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/users", tags=["Users"])


class UserOut(BaseModel):
    userId: UUID
    username: str
    email: str
    isActive: bool
    isSuperuser: bool
    isInstitutionAdmin: bool
    institutionId: UUID
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)


def user_to_out(user: User) -> UserOut:
    """Mapeo explícito de modelo SQLAlchemy -> schema de salida."""
    return UserOut(
        userId=user.userId,
        username=user.username,
        email=user.email,
        isActive=user.isActive,
        isSuperuser=user.isSuperuser,
        isInstitutionAdmin=user.isInstitutionAdmin,
        institutionId=user.institutionId,
        createdAt=user.createdAt,
    )


class UserLookupResponse(BaseModel):
    found: bool
    sameInstitution: Optional[bool] = None
    visibility: Literal["full", "limited", "none"]
    user: Optional[UserOut] = None
    message: Optional[str] = None


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
    # 1) Buscar por email (y opcionalmente confirmar institution_id si se envía)
    stmt = select(User).where(User.email == email)
    if institution_id is not None:
        stmt = stmt.where(User.institutionId == institution_id)

    target = db.execute(stmt).scalar_one_or_none()

    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    same_inst = target.institutionId == current_user.institutionId

    # 2) Determinar visibilidad según rol
    if current_user.isSuperuser:
        # Superuser ve todo
        return UserLookupResponse(
            found=True,
            sameInstitution=same_inst,
            visibility="full",
            user=user_to_out(target),
        )

    if current_user.isInstitutionAdmin:
        if same_inst:
            # Admin de institución ve completa la información
            return UserLookupResponse(
                found=True,
                sameInstitution=True,
                visibility="full",
                user=user_to_out(target),
            )
        else:
            # Admin de institución: existe pero no es de su institución → limited
            return UserLookupResponse(
                found=True,
                sameInstitution=False,
                visibility="limited",
                message="Usuario encontrado pero no pertenece a tu institución",
            )

    # Usuario regular
    if email == current_user.email:
        # Puede ver sus propios datos completos
        return UserLookupResponse(
            found=True,
            sameInstitution=True,
            visibility="full",
            user=user_to_out(target),
        )
    else:
        # Solo indicamos existencia y si comparte institución
        return UserLookupResponse(
            found=True,
            sameInstitution=same_inst,
            visibility="limited",
            message=(
                "Usuario pertenece a tu institución"
                if same_inst
                else "Usuario encontrado pero no pertenece a tu institución"
            ),
        )


@router.get("/{user_id}", response_model=UserOut, summary="Get user by id")
def get_user_by_id(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.execute(select(User).where(User.userId == user_id)).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    if current_user.isSuperuser:
        return user_to_out(user)

    elif current_user.isInstitutionAdmin:
        if current_user.institutionId != user.institutionId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para acceder a este usuario",
            )
        return user_to_out(user)

    elif current_user.userId == user_id:
        return user_to_out(user)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permisos para acceder a este usuario",
    )


@router.get(
    "/",
    response_model=Page[UserOut],
    summary="Get users with optional institution filter and pagination",
)
def get_users(
    institution_id: Optional[UUID] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Iniciar la consulta de usuarios (tanto activos como inactivos)
    base_stmt = select(User)
    count_stmt = select(func.count()).select_from(User)

    # El superadmin puede ver todos; opcionalmente filtrar por institution_id
    if current_user.isSuperuser:
        if institution_id is not None:
            base_stmt = base_stmt.where(User.institutionId == institution_id)
            count_stmt = count_stmt.where(User.institutionId == institution_id)

    # Admin de institución: solo su institución y require institution_id
    elif current_user.isInstitutionAdmin:
        if institution_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debes proporcionar un institution_id para consultar usuarios",
            )
        if institution_id != current_user.institutionId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para acceder a los usuarios de esta institución",
            )
        base_stmt = base_stmt.where(User.institutionId == institution_id)
        count_stmt = count_stmt.where(User.institutionId == institution_id)

    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para acceder a los usuarios",
        )

    base_stmt = base_stmt.limit(limit).offset(offset)

    users = db.scalars(base_stmt).all()
    total_users = db.scalar(count_stmt) or 0

    total_pages = math.ceil(total_users / limit) if total_users else 0
    current_page_index = offset // limit if limit else 0
    remaining_pages = (
        max(total_pages - current_page_index - 1, 0) if total_pages > 0 else 0
    )

    return Page[UserOut](
        items=[user_to_out(u) for u in users],
        total=total_users,
        totalPages=total_pages,
        limit=limit,
        offset=offset,
        remainingPages=remaining_pages,
    )
