# backend/routers/autocomplete.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, exists, or_
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.auth.jwt import get_current_user
from backend.models.models import Taxon, Institution, Occurrence, User, Collection, CollectionPermission
from backend.schemas.autocomplete import SuggestionList

router = APIRouter(prefix="/autocomplete", tags=["autocomplete"])


@router.get("/scientific-name", response_model=SuggestionList)
def autocomplete_scientific_name(
    q: str = Query(..., min_length=1, description="Prefijo del nombre científico"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    term = q.strip()
    if not term:
        return {"items": []}

    pattern = f"{term.lower()}%"  # prefijo

    stmt = (
        select(func.distinct(Taxon.scientificName))
        .where(
            func.unaccent_immutable(
                func.lower(Taxon.scientificName)
            ).like(func.unaccent_immutable(pattern))
        )
        .order_by(Taxon.scientificName)
        .limit(limit)
    )
    items = [row[0] for row in db.execute(stmt) if row[0]]
    return {"items": items}


@router.get("/family", response_model=SuggestionList)
def autocomplete_family(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    term = q.strip()
    if not term:
        return {"items": []}

    pattern = f"{term.lower()}%"

    stmt = (
        select(func.distinct(Taxon.family))
        .where(
            Taxon.family.isnot(None),
            func.unaccent_immutable(func.lower(Taxon.family)).like(
                func.unaccent_immutable(pattern)
            ),
        )
        .order_by(Taxon.family)
        .limit(limit)
    )
    items = [row[0] for row in db.execute(stmt) if row[0]]
    return {"items": items}


@router.get("/institution", response_model=SuggestionList)
def autocomplete_institution(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    term = q.strip()
    if not term:
        return {"items": []}

    pattern = f"%{term.lower()}%"

    stmt = (
        select(func.distinct(Institution.institutionName))
        .where(
            func.unaccent_immutable(
                func.lower(Institution.institutionName)
            ).like(func.unaccent_immutable(pattern))
        )
        .order_by(Institution.institutionName)
        .limit(limit)
    )
    items = [row[0] for row in db.execute(stmt) if row[0]]
    return {"items": items}


@router.get("/location", response_model=SuggestionList)
def autocomplete_location(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    term = q.strip()
    if not term:
        return {"items": []}

    pattern = f"%{term.lower()}%"

    # Mismo expr que el índice ix_occurrence_location_unaccent
    location_expr = func.coalesce(
        Occurrence.locality,
        Occurrence.municipality,
        Occurrence.stateProvince,
        Occurrence.country,
    )

    # Base: seleccionar localidades distintas
    stmt = select(func.distinct(location_expr)).select_from(Occurrence)

    # Join con Collection para poder filtrar por permisos / institución
    stmt = stmt.join(Collection, Occurrence.collectionId == Collection.id, isouter=True)

    where_clauses = [
        location_expr.isnot(None),
        func.unaccent_immutable(func.lower(location_expr)).like(
            func.unaccent_immutable(pattern)
        ),
    ]

    # ---- Filtro de acceso según el usuario ----
    if not current_user.isSuperuser:
        access_conditions = []

        # 1) Colecciones creadas por el usuario
        access_conditions.append(Collection.creatorUserId == current_user.id)

        # 2) Colecciones donde el usuario tiene permiso explícito
        access_conditions.append(
            exists()
            .where(CollectionPermission.collectionId == Occurrence.collectionId)
            .where(CollectionPermission.userId == current_user.id)
        )

        # 3) Si es admin de institución: colecciones de su institución
        if current_user.isInstitutionAdmin:
            access_conditions.append(
                Collection.institutionId == current_user.institutionId
            )

        # Combinar todas las condiciones de acceso
        where_clauses.append(or_(*access_conditions))

    stmt = (
        stmt.where(*where_clauses)
        .order_by(location_expr)
        .limit(limit)
    )

    items = [row[0] for row in db.execute(stmt) if row[0]]
    return {"items": items}


@router.get("/collector", response_model=SuggestionList)
def autocomplete_collector(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    term = q.strip()
    if not term:
        return {"items": []}

    pattern = f"%{term.lower()}%"

    stmt = (
        select(func.distinct(Occurrence.recordedBy))
        .where(
            Occurrence.recordedBy.isnot(None),
            func.unaccent_immutable(func.lower(Occurrence.recordedBy)).like(
                func.unaccent_immutable(pattern)
            ),
        )
        .order_by(Occurrence.recordedBy)
        .limit(limit)
    )
    items = [row[0] for row in db.execute(stmt) if row[0]]
    return {"items": items}
