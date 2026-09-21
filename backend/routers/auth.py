# backend/routers/auth.py
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from backend.auth.jwt import get_current_user
from backend.config.database import get_db
from backend.models.enums import RegistrationStatus
from backend.models.models import User
from backend.schemas.auth import RegistrationRequestItem, UpdateRequestStatusBody
from backend.schemas.common.pages import Page
from backend.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get(
    "/registration-requests",
    summary="Listar solicitudes de registro (paginado, con permisos)",
    response_model=Page[RegistrationRequestItem],
)
def list_registration_requests(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    statusFilter: Optional[RegistrationStatus] = Query(None),
    institutionId: Optional[UUID] = Query(
        None,
        description="ID de institución (obligatorio para institutionAdmin)",
    ),
    fullNamePrefix: Optional[str] = Query(
        None,
        description="Prefijo para filtrar por fullName (case/accent-insensitive)",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return auth_service.list_registration_requests(
        db, limit, offset, statusFilter, institutionId, fullNamePrefix, current_user
    )


# TODO: validar si el nuevo usuario a crear ha sido rejected anteriormente
@router.post("/registration-request", summary="Creates a register request for a new user")
def register_user(
    username: str = Body(..., embed=True),
    email: str = Body(..., embed=True),
    password: str = Body(..., embed=True),
    institutionId: UUID = Body(..., embed=True),
    givenName: Optional[str] = Body(..., embed=True),
    familyName: Optional[str] = Body(..., embed=True),
    orcid: Optional[str] = Body(None, embed=True),
    phone: Optional[str] = Body(None, embed=True),
    address: Optional[str] = Body(None, embed=True),
    db: Session = Depends(get_db),
):
    return auth_service.register_user(
        db,
        username,
        email,
        password,
        institutionId,
        givenName,
        familyName,
        orcid,
        phone,
        address,
    )


@router.patch(
    "/registration-request",
    summary="Update status of a registration request",
)
def update_registration_request_status(
    payload: UpdateRequestStatusBody = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return auth_service.update_registration_request_status(db, payload, current_user)


@router.post("/login", summary="Authenticate user and return JWT token")
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    return auth_service.login_user(db, form_data)
