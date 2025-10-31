# backend/routers/auth.py

from datetime import timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, and_, func
from typing import Optional, Literal, List

from backend.config.database import get_db
from backend.models.models import User, Institution, Agent, RegistrationRequest
from backend.utils.security import hash_password, verify_password
from backend.auth.jwt import create_user_token, get_current_payload, get_current_user
from backend.config.auth import access_token_expire_minutes

from pydantic import BaseModel


router = APIRouter(prefix="/auth", tags=["Authentication"])


# --------- Schemas de salida (evitamos exponer hashed_password) ----------
class RegistrationRequestItem(BaseModel):
    id: int
    username: str
    email: str
    institution_id: int
    full_name: Optional[str]
    given_name: Optional[str]
    family_name: Optional[str]
    orcid: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    status: Literal["pending", "approved", "rejected"]
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_user_id: Optional[int] = None
    resulting_user_id: Optional[int] = None

    class Config:
        from_attributes = True  # Pydantic v2 (equivalente a orm_mode=True)


class RegistrationRequestPage(BaseModel):
    requests: List[RegistrationRequestItem]
    total: int
    total_pages: int
    limit: int
    offset: int


@router.get(
    "/registration-requests",
    summary="Listar solicitudes de registro (paginado, con permisos)",
    response_model=RegistrationRequestPage,
)
def list_registration_requests(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),

    status_filter: Optional[Literal["pending", "approved", "rejected"]] = Query(None),
    institution_id: Optional[int] = Query(None, ge=1),

    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.is_superuser:
        # Superuser: puede listar todo; si pasó institution_id, filtramos por él
        where_clauses = []
        if institution_id is not None:
            where_clauses.append(RegistrationRequest.institution_id == institution_id)
    elif current_user.is_institution_admin:
        # Admin de institución: debe pasar institution_id y debe ser el suyo
        if institution_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="institution_id es obligatorio para administradores de institución",
            )
        if institution_id != current_user.institution_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes consultar solicitudes de otra institución",
            )
        where_clauses = [RegistrationRequest.institution_id == institution_id]
    else:
        # Ni superuser ni admin de institución
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para listar solicitudes de registro",
        )

    if status_filter is not None:
        where_clauses.append(RegistrationRequest.status == status_filter)

    base_stmt = select(RegistrationRequest)
    if where_clauses:
        base_stmt = base_stmt.where(and_(*where_clauses))

    count_stmt = select(func.count()).select_from(RegistrationRequest)
    if where_clauses:
        count_stmt = count_stmt.where(and_(*where_clauses))

    total = db.execute(count_stmt).scalar_one()

    # más reciente primero
    stmt = (
        base_stmt
        .order_by(RegistrationRequest.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    items = db.execute(stmt).scalars().all()

    # 5) Respuesta paginada
    total_pages = (total + limit - 1) // limit if limit > 0 else 1

    requests_payload = [
        RegistrationRequestItem(
            id=r.id,
            username=r.username,
            email=r.email,
            institution_id=r.institution_id,
            full_name=r.full_name,
            given_name=r.given_name,
            family_name=r.family_name,
            orcid=r.orcid,
            phone=r.phone,
            address=r.address,
            status=r.status,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
            reviewed_by_user_id=r.reviewed_by_user_id,
            resulting_user_id=r.resulting_user_id,
        )
        for r in items
    ]

    return RegistrationRequestPage(
        requests=requests_payload,
        total=total,
        total_pages=total_pages,
        limit=limit,
        offset=offset,
    )

# TODO: validar si el nuevo usuario a crear ha sido rejected anteriormente
@router.post("/registration-request", summary="Creates a register request for a new user")
def register_user(
    username: str = Body(..., embed=True),
    email: str = Body(..., embed=True),
    password: str = Body(..., embed=True),
    institution_id: int = Body(..., embed=True, ge=1),

    given_name: Optional[str] = Body(..., embed=True),
    family_name: Optional[str] = Body(..., embed=True),
    orcid: Optional[str] = Body(None, embed=True),
    phone: Optional[str] = Body(None, embed=True),
    address: Optional[str] = Body(None, embed=True),

    db: Session = Depends(get_db),
):
    # Institución obligatoria
    institution = db.execute(
        select(Institution).where(Institution.id == institution_id)
    ).scalar_one_or_none()
    if not institution:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Institución inexistente",
        )

    # el usuario ya existe
    existing_user = db.execute(
        select(User).where(or_(User.username == username, User.email == email))
    ).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username o email ya registrado",
        )

    # Solicitudes pendientes duplicadas: bloquear por email o username
    # (Hay un constraint único (email, status), pero validamos también por username para error 400 claro)
    pending_same_email = db.execute(
        select(RegistrationRequest).where(
            and_(RegistrationRequest.email == email, RegistrationRequest.status == "pending")
        )
    ).scalar_one_or_none()
    if pending_same_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There is already a pending request for this email",
        )

    pending_same_username = db.execute(
        select(RegistrationRequest).where(
            and_(RegistrationRequest.username == username, RegistrationRequest.status == "pending")
        )
    ).scalar_one_or_none()
    if pending_same_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There is already a pending request for this username",
        )

    # Crear solicitud (en estado pendiente)
    full_name = " ".join([p for p in [given_name, family_name] if p]).strip() or None

    req = RegistrationRequest(
        username=username,
        email=email,
        hashed_password=hash_password(password),
        institution_id=institution_id,
        full_name=full_name,
        given_name=given_name,
        family_name=family_name,
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
            "institution_id": req.institution_id,
            "created_at": req.created_at,
        },
    }


class UpdateRequestStatusBody(BaseModel):
    registration_request_id: int
    new_status: Literal["approved", "rejected"]


@router.patch("/registration-request", summary="Update status of a registration request")
def update_registration_request_status(
    payload: UpdateRequestStatusBody = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1) Cargar solicitud
    registration_request = db.execute(
        select(RegistrationRequest).where(RegistrationRequest.id == payload.registration_request_id)
    ).scalar_one_or_none()

    if not registration_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud de registro no encontrada"
        )

    # 2) Solo se permiten transiciones desde 'pending'
    if registration_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La solicitud no está en estado 'pending'; no se puede actualizar"
        )

    # 3) Permisos
    institution = registration_request.institution  # relationship
    if not (
        current_user.is_superuser
        or (current_user.is_institution_admin and current_user.institution_id == institution.id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para actualizar esta solicitud"
        )

    # 4) Rechazo: actualizar y salir
    if payload.new_status == "rejected":
        registration_request.status = "rejected"
        registration_request.reviewed_by_user_id = current_user.id
        registration_request.reviewed_at = datetime.utcnow()

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
                "institution_id": registration_request.institution_id,
                "created_at": registration_request.created_at,
                "reviewed_at": registration_request.reviewed_at,
                "reviewed_by_user_id": registration_request.reviewed_by_user_id,
            },
        }

    # 5) Aprobación: validar colisiones (por si se creó un usuario entre la solicitud y la aprobación)
    #    Evitamos duplicados de username/email en tabla User.
    existing_user = db.execute(
        select(User).where(
            or_(User.username == registration_request.username,
                User.email == registration_request.email)
        )
    ).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un usuario con este username o email. No se puede aprobar."
        )

    agent = Agent(
        givenName=registration_request.given_name,
        familyName=registration_request.family_name,
        fullName=registration_request.full_name,
        orcid=registration_request.orcid,
        phone=registration_request.phone,
        address=registration_request.address,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)

    user = User(
        username=registration_request.username,
        email=registration_request.email,
        hashed_password=registration_request.hashed_password,
        is_active=True,
        is_superuser=False,
        is_institution_admin=False,
        institution_id=registration_request.institution_id,
        agent_id=agent.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    registration_request.status = "approved"
    registration_request.reviewed_by_user_id = current_user.id
    registration_request.reviewed_at = datetime.utcnow()
    registration_request.resulting_user_id = user.id

    db.add(registration_request)
    db.commit()
    db.refresh(registration_request)

    return {
        "message": "Solicitud de registro actualizada correctamente.",
        "request": {
            "id": registration_request.id,
            "status": registration_request.status,
            "username": registration_request.username,
            "email": registration_request.email,
            "institution_id": registration_request.institution_id,
            "created_at": registration_request.created_at,
            "reviewed_at": registration_request.reviewed_at,
            "reviewed_by_user_id": registration_request.reviewed_by_user_id,
            "resulting_user_id": registration_request.resulting_user_id,
        },
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "institution_id": user.institution_id,
        },
        "agent": {
            "id": agent.id,
            "full_name": agent.fullName,
            "orcid": agent.orcid,
            "phone": agent.phone,
            "address": agent.address,
        }
    }

@router.post("/login", summary="Authenticate user and return JWT token")
def login_user(
    email: str = Body(...),
    password: str = Body(...),
    db: Session = Depends(get_db),
):
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    print(f"[auth] User: ", user.email if user else "None")

    institution = None
    if user.institution_id:
        institution = db.execute(select(Institution).where(Institution.id == user.institution_id)).scalar_one_or_none()

    print("[auth] Institutiuon:", institution.institutionName if institution else "None")

    token_expires = timedelta(minutes=access_token_expire_minutes)
    access_token = create_user_token(
        user_id=user.id,
        email=user.email,
        agent_id=user.agent_id,
        expires_delta=token_expires,
    )

    print(access_token)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.agent.fullName if user.agent else None,
            "username": user.username,
            "email": user.email,
            "is_admin": user.is_superuser,
            "is_institution_admin": user.is_institution_admin,
            "institution": institution.institutionName if institution else None,
            "agent_id": user.agent_id,
            "institution_id": institution.id,
        },
    }
