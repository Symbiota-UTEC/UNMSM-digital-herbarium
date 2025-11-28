# backend/routers/auth.py

from datetime import timedelta, datetime
from typing import Optional, Literal, List

from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from sqlalchemy import select, or_, and_, func, update as sa_update
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.models.models import User, Institution, RegistrationRequest
from backend.utils.security import hash_password, verify_password
from backend.auth.jwt import create_user_token, get_current_user
from backend.config.auth import access_token_expire_minutes

from backend.schemas.common.pages import Page
from backend.schemas.auth import RegistrationRequestItem, UpdateRequestStatusBody

router = APIRouter(prefix="/auth", tags=["Authentication"])


# -------------------------------------------------------------------
# Listar solicitudes de registro (paginado)
# -------------------------------------------------------------------


@router.get(
    "/registration-requests",
    summary="Listar solicitudes de registro (paginado, con permisos)",
    response_model=Page[RegistrationRequestItem],
)
def list_registration_requests(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    statusFilter: Optional[Literal["pending", "approved", "rejected"]] = Query(None),
    institutionId: Optional[int] = Query(
        None,
        ge=1,
        description="ID de institución (obligatorio para institutionAdmin)",
    ),
    fullNamePrefix: Optional[str] = Query(
        None,
        description="Prefijo para filtrar por fullName (case/accent-insensitive)",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # --- Permisos ---
    if current_user.isSuperuser:
        where_clauses = []
        if institutionId is not None:
            where_clauses.append(
                RegistrationRequest.institutionId == institutionId
            )
    elif current_user.isInstitutionAdmin:
        if institutionId is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="institutionId es obligatorio para administradores de institución",
            )
        if institutionId != current_user.institutionId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes consultar solicitudes de otra institución",
            )
        where_clauses = [RegistrationRequest.institutionId == institutionId]
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para listar solicitudes de registro",
        )

    # --- Filtros adicionales ---
    if statusFilter is not None:
        where_clauses.append(RegistrationRequest.status == statusFilter)

    if fullNamePrefix:
        pattern = f"{fullNamePrefix}%"
        where_clauses.append(
            func.unaccent(
                func.coalesce(RegistrationRequest.fullName, "")
            ).ilike(func.unaccent(pattern))
        )

    base_stmt = (
        select(RegistrationRequest)
        .join(Institution, Institution.id == RegistrationRequest.institutionId)
    )
    if where_clauses:
        base_stmt = base_stmt.where(and_(*where_clauses))

    count_stmt = (
        select(func.count())
        .select_from(RegistrationRequest)
        .join(Institution, Institution.id == RegistrationRequest.institutionId)
    )
    if where_clauses:
        count_stmt = count_stmt.where(and_(*where_clauses))

    total = db.execute(count_stmt).scalar_one() or 0

    stmt = (
        base_stmt
        .order_by(RegistrationRequest.createdAt.desc())
        .limit(limit)
        .offset(offset)
    )

    rows = db.execute(stmt).scalars().all()

    items: List[RegistrationRequestItem] = [
        RegistrationRequestItem(
            id=r.id,
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

    total_pages = (total + limit - 1) // limit if limit > 0 else 1
    current_page = (offset // limit) + 1 if limit > 0 else 1
    remaining_pages = max(total_pages - current_page, 0)

    return Page[RegistrationRequestItem](
        items=items,
        total=total,
        currentPage=current_page,
        totalPages=total_pages,
        limit=limit,
        offset=offset,
        remainingPages=remaining_pages,
    )


# -------------------------------------------------------------------
# Crear solicitud de registro
# -------------------------------------------------------------------


# TODO: validar si el nuevo usuario a crear ha sido rejected anteriormente
@router.post("/registration-request", summary="Creates a register request for a new user")
def register_user(
    username: str = Body(..., embed=True),
    email: str = Body(..., embed=True),
    password: str = Body(..., embed=True),
    institutionId: int = Body(..., embed=True, ge=1),
    givenName: Optional[str] = Body(..., embed=True),
    familyName: Optional[str] = Body(..., embed=True),
    orcid: Optional[str] = Body(None, embed=True),
    phone: Optional[str] = Body(None, embed=True),
    address: Optional[str] = Body(None, embed=True),
    db: Session = Depends(get_db),
):
    # 1) Institución obligatoria
    institution = db.execute(
        select(Institution).where(Institution.id == institutionId)
    ).scalar_one_or_none()
    if not institution:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Institución inexistente",
        )

    # 2) Usuario ya existe
    existing_user = db.execute(
        select(User).where(
            or_(User.username == username, User.email == email)
        )
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
                RegistrationRequest.status == "pending",
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
                RegistrationRequest.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if pending_same_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There is already a pending request for this username",
        )

    # 5) Crear solicitud (en estado pending)
    full_name = " ".join(
        [p for p in [givenName, familyName] if p]
    ).strip() or None

    req = RegistrationRequest(
        username=username,
        email=email,
        hashedPassword=hash_password(password),
        institutionId=institutionId,
        fullName=full_name,
        givenName=givenName,
        familyName=familyName,
        orcid=orcid,
        phone=phone,
        address=address,
        status="pending",
    )

    db.add(req)
    db.commit()
    db.refresh(req)

    return {
        "message": "Se creó una solicitud de registro. Un administrador la revisará.",
        "request": {
            "id": req.id,
            "status": req.status,
            "username": req.username,
            "email": req.email,
            "institutionId": req.institutionId,
            "createdAt": req.createdAt,
        },
    }


# -------------------------------------------------------------------
# Actualizar estado de solicitud (approve / reject)
# -------------------------------------------------------------------


@router.patch(
    "/registration-request",
    summary="Update status of a registration request",
)
def update_registration_request_status(
    payload: UpdateRequestStatusBody = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1) Cargar solicitud
    registration_request = db.execute(
        select(RegistrationRequest).where(
            RegistrationRequest.id == payload.registrationRequestId
        )
    ).scalar_one_or_none()

    if not registration_request:
        raise HTTPException(
            status_code=404, detail="Solicitud de registro no encontrada"
        )

    # 2) Solo desde 'pending'
    if registration_request.status != "pending":
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
            and current_user.institutionId == institution.id
        )
    ):
        raise HTTPException(
            status_code=403,
            detail="No tienes permisos para actualizar esta solicitud",
        )

    # 4) Rechazo (no crea usuario)
    if payload.newStatus == "rejected":
        registration_request.status = "rejected"
        registration_request.reviewedByUserId = current_user.id
        registration_request.reviewedAt = datetime.utcnow()
        db.add(registration_request)
        db.commit()
        db.refresh(registration_request)

        return {
            "message": "Solicitud de registro rechazada correctamente.",
            "request": {
                "id": registration_request.id,
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
        db.flush()  # obtener user.id

        # b) Incremento atómico de usersCount (+1) en Institution
        db.execute(
            sa_update(Institution)
            .where(Institution.id == registration_request.institutionId)
            .values(usersCount=func.coalesce(Institution.usersCount, 0) + 1)
        )

        # c) Marcar solicitud como aprobada
        registration_request.status = "approved"
        registration_request.reviewedByUserId = current_user.id
        registration_request.reviewedAt = datetime.utcnow()
        registration_request.resultingUserId = user.id
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
            "id": registration_request.id,
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
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "institutionId": user.institutionId,
        },
    }


# -------------------------------------------------------------------
# Login
# -------------------------------------------------------------------


@router.post("/login", summary="Authenticate user and return JWT token")
def login_user(
    email: str = Body(...),
    password: str = Body(...),
    db: Session = Depends(get_db),
):
    user = db.execute(
        select(User).where(User.email == email)
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(password, user.hashedPassword):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.isActive:
        raise HTTPException(status_code=401, detail="Inactive user")

    institution = None
    if user.institutionId:
        institution = db.execute(
            select(Institution).where(Institution.id == user.institutionId)
        ).scalar_one_or_none()

    token_expires = timedelta(minutes=access_token_expire_minutes)
    access_token = create_user_token(
        user_id=user.id,
        email=user.email,
        expires_delta=token_expires,
    )

    return {
        "accessToken": access_token,
        "tokenType": "bearer",
        "user": {
            "id": user.id,
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
