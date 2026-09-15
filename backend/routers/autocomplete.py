# backend/routers/autocomplete.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.auth.jwt import get_current_user
from backend.models.models import User
from backend.schemas.autocomplete import SuggestionList, ScientificNameSuggestionList
from backend.services import autocomplete as autocomplete_service

router = APIRouter(prefix="/autocomplete", tags=["autocomplete"])


@router.get("/scientific-name", response_model=ScientificNameSuggestionList)
def autocomplete_scientific_name(
    q: str = Query(..., min_length=1, description="Prefijo del nombre científico"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    return {"items": autocomplete_service.suggest_scientific_names(db, q, limit)}


@router.get("/family", response_model=SuggestionList)
def autocomplete_family(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    return {"items": autocomplete_service.suggest_families(db, q, limit)}


@router.get("/institution", response_model=SuggestionList)
def autocomplete_institution(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    return {"items": autocomplete_service.suggest_institutions(db, q, limit)}


@router.get("/location", response_model=SuggestionList)
def autocomplete_location(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"items": autocomplete_service.suggest_locations(db, q, limit, current_user)}


@router.get("/collector", response_model=SuggestionList)
def autocomplete_collector(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    return {"items": autocomplete_service.suggest_collectors(db, q, limit)}
