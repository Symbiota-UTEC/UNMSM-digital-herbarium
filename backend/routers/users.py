import math
from typing import List, Optional, Literal

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.config.database import get_db
from backend.models.models import User, Institution
from backend.auth.jwt import get_current_user

from pydantic import BaseModel, ConfigDict


router = APIRouter(prefix="/users", tags=["Users"])


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    is_superuser: bool
    is_institution_admin: bool
    agent_id: Optional[int] = None
    institution_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# TODO: estandarizar paginacion
class UserPaginationResponse(BaseModel):
    users: List[UserOut]
    total_users: int
    total_pages: int
    limit: int
    offset: int


class UserLookupResponse(BaseModel):
    found: bool
    same_institution: Optional[bool] = None
    visibility: Literal["full", "limited", "none"]
    user: Optional[UserOut] = None
    message: Optional[str] = None


@router.get(
    "/by-email",
    response_model=UserLookupResponse,
    summary="Get user by email with role-aware visibility"
)
def get_user_by_email(
    email: str = Query(...),
    institution_id: Optional[int] = None,  # opcional; no otorga privilegios
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1) Buscar por email (y opcionalmente confirmar institution_id si se envía)
    stmt = select(User).where(User.email == email)
    if institution_id is not None:
        stmt = stmt.where(User.institution_id == institution_id)

    target = db.execute(stmt).scalar_one_or_none()

    if not target:
        # 404 solo si de verdad NO existe el email en el sistema
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    same_inst = (target.institution_id == current_user.institution_id)

    # 2) Determinar visibilidad según rol
    if current_user.is_superuser:
        # Superuser ve todo
        return UserLookupResponse(
            found=True,
            same_institution=same_inst,
            visibility="full",
            user=target
        )

    if current_user.is_institution_admin:
        if same_inst:
            # Admin de institución ve completa la informacion
            return UserLookupResponse(
                found=True,
                same_institution=True,
                visibility="full",
                user=target
            )
        else:
            # Admin de institución: existe pero no es de su institución → limited
            return UserLookupResponse(
                found=True,
                same_institution=False,
                visibility="limited",
                message="Usuario encontrado pero no pertenece a tu institución"
            )

    # Usuario regular
    if email == current_user.email:
        # Puede ver sus propios datos completos
        return UserLookupResponse(
            found=True,
            same_institution=True,  # por definición comparte su propia institución
            visibility="full",
            user=target
        )
    else:
        # Cualquier usuario puede consultar por email:
        # - solo indicamos si existe y si es o no de su institución
        # - NO devolvemos datos sensibles
        return UserLookupResponse(
            found=True,
            same_institution=same_inst,
            visibility="limited",
            message=(
                "Usuario pertenece a tu institución" if same_inst
                else "Usuario encontrado pero no pertenece a tu institución"
            )
        )


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


# TODO: rename users=[...] to items
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
            agent_id=user.agent_id,
            institution_id=user.institution_id,
            created_at=user.created_at,
        ) for user in users],
        total_users=total_users,
        total_pages=total_pages,
        limit=limit,
        offset=offset
    )


@router.patch("/{user_id}/assign_admin", summary="Assign a user as an institution admin")
def assign_institution_admin(
    user_id: int,
    institution_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para realizar esta acción",
        )

    user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    institution = db.execute(select(Institution).where(Institution.id == institution_id)).scalar_one_or_none()
    if not institution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institución no encontrada",
        )

    if user.institution_id != institution_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario no está asociado con la institución proporcionada",
        )

    user.is_institution_admin = True
    institution.institution_admin_user_id = current_user.id

    db.commit()

    return {"detail": "Usuario asignado como administrador de la institución"}
