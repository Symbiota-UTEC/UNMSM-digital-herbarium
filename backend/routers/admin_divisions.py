# backend/routers/admin_divisions.py
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.schemas.admin_division import (
    AdminDivisionListOut,
    CountryListOut,
    ResolveOut,
)
from backend.services import admin_divisions as admin_divisions_service

router = APIRouter(prefix="/admin-divisions", tags=["admin-divisions"])


@router.get("/countries", response_model=CountryListOut)
def list_countries(db: Session = Depends(get_db)):
    """Países del catálogo de divisiones administrativas (fuente de la UI)."""
    return admin_divisions_service.list_countries(db)


@router.get("/resolve", response_model=ResolveOut)
def resolve_location(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db),
):
    """Departamento/provincia/distrito que contiene el punto (Perú)."""
    return admin_divisions_service.resolve_point(db, lat, lon)


@router.get("", response_model=AdminDivisionListOut)
def list_divisions(
    countryCode: Optional[str] = Query(None, min_length=2, max_length=2),
    level: Optional[int] = Query(None, ge=1, le=3),
    parentId: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
):
    """Divisiones administrativas por país/nivel o como hijos de `parentId`."""
    return admin_divisions_service.list_divisions(
        db, country_code=countryCode, level=level, parent_id=parentId
    )
