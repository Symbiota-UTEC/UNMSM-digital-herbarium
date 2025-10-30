# backend/routers/auth.py

from datetime import timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, and_
from typing import Optional

from backend.config.database import get_db
from backend.models.models import User, Institution, Agent, RegistrationRequest
from backend.utils.security import hash_password, verify_password
from backend.auth.jwt import create_user_token, get_current_payload, get_current_user
from backend.config.auth import access_token_expire_minutes


router = APIRouter(prefix="/auth", tags=["Authentication"])

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


@router.patch("/registration-request", summary="Accept a registration request")
def accept_registration(
    registration_request_id: int = Body(..., embed=True, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # Obtiene al usuario autenticado
):
    registration_request = db.execute(
        select(RegistrationRequest).where(RegistrationRequest.id == registration_request_id)
    ).scalar_one_or_none()

    if not registration_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud de registro no encontrada"
        )

    if registration_request.status != "pending":
        raise HTTPException(status_code=400, detail="La solicitud no está en estado pendiente")

    institution = registration_request.institution

    if not (
        current_user.is_superuser
        or (current_user.is_institution_admin and current_user.institution_id == institution.id)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para aceptar esta solicitud"
        )

    # Información del Curador
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

    # Crear el usuario
    user = User(
        username=registration_request.username,
        email=registration_request.email,
        hashed_password=hash_password(registration_request.hashed_password),
        is_active=True,  # Se activa automáticamente
        is_superuser=False,
        is_institution_admin=False,
        institution_id=registration_request.institution_id,  # Asociar la institución de la solicitud
        agent_id=agent.id,  # Asociar el agente al usuario
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
        "message": "Solicitud de registro aceptada correctamente.",
        "request": {
            "id": registration_request.id,
            "status": registration_request.status,
            "username": registration_request.username,
            "email": registration_request.email,
            "institution_id": registration_request.institution_id,
            "created_at": registration_request.created_at,
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




@router.get("/me", summary="Get current user info from JWT")
def get_me(payload = Depends(get_current_payload)):
    return {
        "username": payload["sub"],
        "user_id": payload["user_id"],
        "agent_id": payload.get("agent_id"),
    }
