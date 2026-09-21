# backend/routers/institutions.py
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.auth.jwt import get_current_user
from backend.config.database import get_db
from backend.models.models import User
from backend.schemas.common.pages import Page
from backend.schemas.institutions import (
    InstitutionCreate,
    InstitutionOut,
    InstitutionUpdate,
)
from backend.services import institutions as institutions_service

router = APIRouter(prefix="/institutions", tags=["Institutions"])


@router.get(
    "",
    response_model=Page[InstitutionOut],
    summary="Listar instituciones con paginación",
)
def list_institutions(
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    name_prefix: Optional[str] = Query(
        None,
        alias="namePrefix",  # <-- para que ?namePrefix=... funcione
        description="Filtro por nombre de institución (contiene, case/accent-insensitive)",
    ),
):
    return institutions_service.list_institutions(db, limit, offset, name_prefix)


@router.get(
    "/{institution_id}",
    response_model=InstitutionOut,
    summary="Obtener institución por id",
)
def get_institution_by_id(
    institution_id: UUID,
    db: Session = Depends(get_db),
):
    return institutions_service.get_institution_by_id(db, institution_id)


@router.post(
    "",
    response_model=InstitutionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una nueva institución",
)
def create_institution(
    institution: InstitutionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return institutions_service.create_institution(db, institution, current_user)


@router.patch(
    "/{institution_id}",
    response_model=InstitutionOut,
    summary="Actualizar información de una institución (parcial)",
)
def update_institution(
    institution_id: UUID,
    institution: InstitutionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return institutions_service.update_institution(db, institution_id, institution, current_user)
