# backend/services/users.py
from uuid import UUID
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from backend.models.models import User
from backend.schemas.common.pages import Page
from backend.schemas.users import UserOut, UserLookupResponse


def get_user_by_email(
    db: Session, email: str, institution_id: Optional[UUID], current_user: User
) -> UserLookupResponse:
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
            user=UserOut.model_validate(target, from_attributes=True),
        )

    if current_user.isInstitutionAdmin:
        if same_inst:
            # Admin de institución ve completa la información
            return UserLookupResponse(
                found=True,
                sameInstitution=True,
                visibility="full",
                user=UserOut.model_validate(target, from_attributes=True),
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
            user=UserOut.model_validate(target, from_attributes=True),
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


def get_user_by_id(db: Session, user_id: UUID, current_user: User) -> UserOut:
    user = db.execute(select(User).where(User.userId == user_id)).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    if current_user.isSuperuser:
        return UserOut.model_validate(user, from_attributes=True)

    elif current_user.isInstitutionAdmin:
        if current_user.institutionId != user.institutionId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para acceder a este usuario",
            )
        return UserOut.model_validate(user, from_attributes=True)

    elif current_user.userId == user_id:
        return UserOut.model_validate(user, from_attributes=True)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes permisos para acceder a este usuario",
    )


def get_users(
    db: Session,
    institution_id: Optional[UUID],
    limit: int,
    offset: int,
    current_user: User,
) -> Page[UserOut]:
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

    return Page[UserOut].of(
        [UserOut.model_validate(u, from_attributes=True) for u in users],
        total=total_users, limit=limit, offset=offset
    )
