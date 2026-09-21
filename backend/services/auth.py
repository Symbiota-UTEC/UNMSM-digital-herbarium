# backend/services/auth.py
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import and_, func, or_, select
from sqlalchemy import update as sa_update
from sqlalchemy.orm import Session

from backend.auth.jwt import create_user_token
from backend.config.auth import access_token_expire_minutes
from backend.models.enums import RegistrationStatus
from backend.models.models import Institution, RegistrationRequest, User
from backend.schemas.auth import RegistrationRequestItem, UpdateRequestStatusBody
from backend.schemas.common.pages import Page
from backend.utils.security import hash_password, verify_password


def list_registration_requests(
    db: Session,
    limit: int,
    offset: int,
    status_filter: Optional[RegistrationStatus],
    institution_id: Optional[UUID],
    full_name_prefix: Optional[str],
    current_user: User,
) -> Page[RegistrationRequestItem]:
    # --- Permisos ---
    if current_user.isSuperuser:
        where_clauses = []
        if institution_id is not None:
            where_clauses.append(RegistrationRequest.institutionId == institution_id)
    elif current_user.isInstitutionAdmin:
        if institution_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="institutionId es obligatorio para administradores de institución",
            )
        if institution_id != current_user.institutionId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes consultar solicitudes de otra institución",
            )
        where_clauses = [RegistrationRequest.institutionId == institution_id]
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para listar solicitudes de registro",
        )

    # --- Filtros adicionales ---
    if status_filter is not None:
        where_clauses.append(RegistrationRequest.status == status_filter)

    if full_name_prefix:
        pattern = f"{full_name_prefix}%"
        where_clauses.append(
            func.unaccent(func.coalesce(RegistrationRequest.fullName, "")).ilike(
                func.unaccent(pattern)
            )
        )

    base_stmt = select(RegistrationRequest).join(
        Institution, Institution.institutionId == RegistrationRequest.institutionId
    )
    if where_clauses:
        base_stmt = base_stmt.where(and_(*where_clauses))

    count_stmt = (
        select(func.count())
        .select_from(RegistrationRequest)
        .join(Institution, Institution.institutionId == RegistrationRequest.institutionId)
    )
    if where_clauses:
        count_stmt = count_stmt.where(and_(*where_clauses))

    total = db.execute(count_stmt).scalar_one() or 0

    stmt = base_stmt.order_by(RegistrationRequest.createdAt.desc()).limit(limit).offset(offset)

    rows = db.execute(stmt).scalars().all()

    items: List[RegistrationRequestItem] = [
        RegistrationRequestItem(
            registrationRequestId=r.registrationRequestId,
            username=r.username,
            email=r.email,
            institutionId=r.institutionId,
            institutionName=r.institution.institutionName if r.institution else None,
            fullName=r.fullName,
            givenName=r.givenName,
            familyName=r.familyName,
            orcid=r.orcid,
            phone=r.phone,
            address=r.address,
            status=r.status,
            createdAt=r.createdAt,
            reviewedAt=r.reviewedAt,
            reviewedByUserId=r.reviewedByUserId,
            resultingUserId=r.resultingUserId,
        )
        for r in rows
    ]

    return Page[RegistrationRequestItem].of(items, total=total, limit=limit, offset=offset)


# TODO: validar si el nuevo usuario a crear ha sido rejected anteriormente
def register_user(
    db: Session,
    username: str,
    email: str,
    password: str,
    institution_id: UUID,
    given_name: Optional[str],
    family_name: Optional[str],
    orcid: Optional[str],
    phone: Optional[str],
    address: Optional[str],
) -> dict:
    # 1) Institución obligatoria
    institution = db.execute(
        select(Institution).where(Institution.institutionId == institution_id)
    ).scalar_one_or_none()
    if not institution:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Institución inexistente",
        )

    # 2) Usuario ya existe
    existing_user = db.execute(
        select(User).where(or_(User.username == username, User.email == email))
    ).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username o email ya registrado",
        )

    # 3) Solicitudes pendientes duplicadas (email)
    pending_same_email = db.execute(
        select(RegistrationRequest).where(
            and_(
                RegistrationRequest.email == email,
                RegistrationRequest.status == RegistrationStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    if pending_same_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There is already a pending request for this email",
        )

    # 4) Solicitudes pendientes duplicadas (username)
    pending_same_username = db.execute(
        select(RegistrationRequest).where(
            and_(
                RegistrationRequest.username == username,
                RegistrationRequest.status == RegistrationStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    if pending_same_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There is already a pending request for this username",
        )

    # 5) Crear solicitud (en estado pending)
    full_name = " ".join([p for p in [given_name, family_name] if p]).strip() or None

    req = RegistrationRequest(
        username=username,
        email=email,
        hashedPassword=hash_password(password),
        institutionId=institution_id,
        fullName=full_name,
        givenName=given_name,
        familyName=family_name,
        orcid=orcid,
        phone=phone,
        address=address,
        status=RegistrationStatus.PENDING,
    )

    db.add(req)
    db.commit()
    db.refresh(req)

    return {
        "message": "Se creó una solicitud de registro. Un administrador la revisará.",
        "request": {
            "id": req.registrationRequestId,
            "status": req.status,
            "username": req.username,
            "email": req.email,
            "institutionId": req.institutionId,
            "createdAt": req.createdAt,
        },
    }


def update_registration_request_status(
    db: Session, payload: UpdateRequestStatusBody, current_user: User
) -> dict:
    # 1) Cargar solicitud
    registration_request = db.execute(
        select(RegistrationRequest).where(
            RegistrationRequest.registrationRequestId == payload.registrationRequestId
        )
    ).scalar_one_or_none()

    if not registration_request:
        raise HTTPException(status_code=404, detail="Solicitud de registro no encontrada")

    # 2) Solo desde 'pending'
    if registration_request.status != RegistrationStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail="La solicitud no está en estado 'pending'; no se puede actualizar",
        )

    # 3) Permisos
    institution = registration_request.institution  # relationship
    if not (
        current_user.isSuperuser
        or (
            current_user.isInstitutionAdmin
            and current_user.institutionId == institution.institutionId
        )
    ):
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para actualizar esta solicitud",
        )

    # 4) Rechazo (no crea usuario)
    if payload.newStatus == RegistrationStatus.REJECTED:
        registration_request.status = RegistrationStatus.REJECTED
        registration_request.reviewedByUserId = current_user.userId
        registration_request.reviewedAt = datetime.utcnow()
        db.add(registration_request)
        db.commit()
        db.refresh(registration_request)

        return {
            "message": "Solicitud de registro rechazada correctamente.",
            "request": {
                "registrationRequestId": registration_request.registrationRequestId,
                "status": registration_request.status,
                "username": registration_request.username,
                "email": registration_request.email,
                "institutionId": registration_request.institutionId,
                "createdAt": registration_request.createdAt,
                "reviewedAt": registration_request.reviewedAt,
                "reviewedByUserId": registration_request.reviewedByUserId,
            },
        }

    # 5) Aprobación
    # Validar colisiones
    existing_user = db.execute(
        select(User).where(
            or_(
                User.username == registration_request.username,
                User.email == registration_request.email,
            )
        )
    ).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Ya existe un usuario con este username o email. No se puede aprobar.",
        )

    try:
        # a) Crear User (ya no se crea Agent)
        user = User(
            username=registration_request.username,
            email=registration_request.email,
            hashedPassword=registration_request.hashedPassword,
            isActive=True,
            isSuperuser=False,
            isInstitutionAdmin=False,
            institutionId=registration_request.institutionId,
            givenName=registration_request.givenName,
            familyName=registration_request.familyName,
            fullName=registration_request.fullName,
            orcid=registration_request.orcid,
            phone=registration_request.phone,
            address=registration_request.address,
        )
        db.add(user)
        db.flush()  # obtener user.userId

        # b) Incremento atómico de usersCount (+1) en Institution
        db.execute(
            sa_update(Institution)
            .where(Institution.institutionId == registration_request.institutionId)
            .values(usersCount=func.coalesce(Institution.usersCount, 0) + 1)
        )

        # c) Marcar solicitud como aprobada
        registration_request.status = RegistrationStatus.APPROVED
        registration_request.reviewedByUserId = current_user.userId
        registration_request.reviewedAt = datetime.utcnow()
        registration_request.resultingUserId = user.userId
        db.add(registration_request)

        # d) Commit único
        db.commit()

        # Refrescar para respuesta
        db.refresh(user)
        db.refresh(registration_request)

    except Exception:
        db.rollback()
        raise

    return {
        "message": "Solicitud de registro actualizada correctamente.",
        "request": {
            "registrationRequestId": registration_request.registrationRequestId,
            "status": registration_request.status,
            "username": registration_request.username,
            "email": registration_request.email,
            "institutionId": registration_request.institutionId,
            "createdAt": registration_request.createdAt,
            "reviewedAt": registration_request.reviewedAt,
            "reviewedByUserId": registration_request.reviewedByUserId,
            "resultingUserId": registration_request.resultingUserId,
        },
        "user": {
            "userId": user.userId,
            "username": user.username,
            "email": user.email,
            "institutionId": user.institutionId,
        },
    }


def login_user(db: Session, form_data: OAuth2PasswordRequestForm) -> dict:
    user = db.execute(select(User).where(User.email == form_data.username)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(form_data.password, user.hashedPassword):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.isActive:
        raise HTTPException(status_code=401, detail="Inactive user")

    institution = None
    if user.institutionId:
        institution = db.execute(
            select(Institution).where(Institution.institutionId == user.institutionId)
        ).scalar_one_or_none()

    token_expires = timedelta(minutes=access_token_expire_minutes)
    access_token = create_user_token(
        user_id=user.userId,
        email=user.email,
        expires_delta=token_expires,
    )

    # IMPORTANTE: Para que Swagger reconozca el token, las llaves DEBEN ser
    # access_token y token_type (en snake_case, no camelCase)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "userId": user.userId,
            "name": user.fullName,
            "username": user.username,
            "email": user.email,
            "isActive": user.isActive,
            "isSuperuser": user.isSuperuser,
            "isInstitutionAdmin": user.isInstitutionAdmin,
            "institution": institution.institutionName if institution else None,
            "institutionId": user.institutionId,
            "createdAt": user.createdAt.isoformat() if user.createdAt else None,
        },
    }
