# backend/routers/occurrence.py
from __future__ import annotations

import json
from datetime import datetime, date
from typing import Optional, Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, exists, or_, func, and_
from sqlalchemy.orm import Session, selectinload

from backend.config.database import get_db
from backend.auth.jwt import get_current_user
from backend.models.models import (
    Occurrence,
    Collection,
    CollectionPermission,
    Institution,
    User,
    Identification,
    Identifier,
    Taxon,
    Agent,
)
from backend.schemas import Page
from backend.schemas.occurrence import (
    OccurrenceOut,
    OccurrenceBriefItem,
    DynamicPropsIn,
)


router = APIRouter(
    prefix="/occurrences",
    tags=["Occurrences"],
)


# =========================
# Helpers
# =========================


def _fmt_dt(v: Optional[datetime | date | str]) -> Optional[str]:
    """
    Normaliza fechas a 'dd/mm/aaaa'.
    - datetime/date => se formatea
    - str => intenta parsear ISO u otros formatos comunes; si no puede, devuelve la misma string
    - None => None
    """
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%d/%m/%Y")
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        s2 = s.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s2)
            return dt.strftime("%d/%m/%Y")
        except Exception:
            pass
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
            try:
                dt = datetime.strptime(s, fmt)
                return dt.strftime("%d/%m/%Y")
            except Exception:
                continue
        return s
    return None


def _user_flags(user: User):
    """Pequeño helper para tolerar nombres snake/camel."""
    is_superuser = getattr(user, "isSuperuser", getattr(user, "is_superuser", False))
    is_inst_admin = getattr(
        user, "isInstitutionAdmin", getattr(user, "is_institution_admin", False)
    )
    institution_id = getattr(user, "institutionId", getattr(user, "institution_id", None))
    return is_superuser, is_inst_admin, institution_id


def _user_can_view_collection(db: Session, user: User, collection: Collection) -> bool:
    """
    Reglas:
       - superuser: acceso
       - permiso explícito (viewer/editor/owner): acceso
       - admin de institución y misma institución: acceso
    """
    is_superuser, is_inst_admin, user_inst_id = _user_flags(user)

    if is_superuser:
        return True

    # permiso explícito
    perm_exists = db.scalar(
        select(
            exists().where(
                (CollectionPermission.collectionId == collection.id)
                & (CollectionPermission.userId == user.id)
            )
        )
    )
    if perm_exists:
        return True

    # admin de la institución que posee la colección
    if is_inst_admin and collection.institutionId and user_inst_id:
        if int(collection.institutionId) == int(user_inst_id):
            return True

    return False


def _user_can_edit_collection(db: Session, user: User, collection: Collection) -> bool:
    """
    Permisos de edición:
       - superuser
       - admin de la institución dueña
       - rol explícito editor/owner
    """
    is_superuser, is_inst_admin, user_inst_id = _user_flags(user)

    if is_superuser:
        return True

    if is_inst_admin and collection.institutionId and user_inst_id:
        if int(collection.institutionId) == int(user_inst_id):
            return True

    role = db.scalar(
        select(CollectionPermission.role).where(
            (CollectionPermission.collectionId == collection.id)
            & (CollectionPermission.userId == user.id)
        )
    )
    return role in ("editor", "owner")


def _page_meta(total: int, limit: int, offset: int) -> tuple[int, int, int]:
    """
    Devuelve (total_pages, current_page, remaining_pages) usando la misma lógica
    que en Collections.
    """
    if limit <= 0:
        return 0, 1, 0

    if total == 0:
        # totalPages = 0, currentPage = 1, remainingPages = 0
        return 0, 1, 0

    total_pages = (total + limit - 1) // limit
    current_page = min(total_pages, (offset // limit) + 1)
    remaining_pages = max(0, total_pages - current_page)
    return total_pages, current_page, remaining_pages



# =========================
# Endpoints
# =========================


@router.get(
    "/{occurrence_id}",
    response_model=OccurrenceOut,
    status_code=status.HTTP_200_OK,
    summary="Detalle de ocurrencia por ID",
)
def get_occurrence_by_id(
    occurrence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve una ocurrencia por ID, incluyendo:
    - Campos Occurrence aplanados (Occurrence + Event + Location).
    - Colección asociada.
    - Colectores (Agent).
    - Identificaciones (Identification) + identificadores (Identifier) + taxón.
    """
    stmt = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.collection),
            selectinload(Occurrence.agents),
            selectinload(Occurrence.identifications)
            .selectinload(Identification.identifiers),
            selectinload(Occurrence.identifications)
            .selectinload(Identification.taxon),
        )
        .where(Occurrence.id == occurrence_id)
    )
    occ = db.scalar(stmt)

    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")

    if not occ.collection:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied (occurrence without collection)",
        )

    if not _user_can_view_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Pydantic v2 con from_attributes=True en OccurrenceOut hace el mapeo completo.
    # Gracias a los serialization_alias en los submodelos, agentID/identifierID salen como "orcid".
    return OccurrenceOut.model_validate(occ, from_attributes=True)


@router.get(
    "",
    response_model=Page[OccurrenceBriefItem],
    summary="Lista de ocurrencias visibles (vista breve) para el usuario actual",
)
def list_occurrences_basic(
    page: int = Query(1, ge=1, description="Número de página (1-based)"),
    page_size: int = Query(50, ge=1, le=200, description="Tamaño de página"),
    q: Optional[str] = Query(
        None,
        description="Buscar en código, nombre científico, familia, ubicación o recolector (ILIKE)",
    ),
    collection_id: Optional[int] = Query(
        None, description="Filtrar por ID de colección específico"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Vista breve:
    - code: catalogNumber o, si falta, recordNumber.
    - scientificName, family: del taxón de la identificación marcada como isCurrent=True (si existe).
    - location: coalesce(locality, municipality, stateProvince, country).
    - collector: recordedBy.
    - date: eventDate (normalizada a dd/mm/aaaa cuando se puede parsear).
    """
    is_superuser, is_inst_admin, user_inst_id = _user_flags(current_user)

    code_expr = func.coalesce(Occurrence.catalogNumber, Occurrence.recordNumber)
    location_expr = func.coalesce(
        Occurrence.locality,
        Occurrence.municipality,
        Occurrence.stateProvince,
        Occurrence.country,
    )

    # Join a la identificación "current" (si hay) y su Taxon
    base_select = (
        select(
            Occurrence.id.label("occ_id"),
            code_expr.label("code"),
            Taxon.scientificName.label("scientific_name"),
            Taxon.family.label("family"),
            location_expr.label("location"),
            Occurrence.recordedBy.label("collector"),
            Occurrence.eventDate.label("date"),
            Collection.id.label("collection_id"),
            Collection.institutionId.label("collection_institution_id"),
        )
        .join(Collection, Occurrence.collectionId == Collection.id)
        .outerjoin(
            Identification,
            and_(
                Identification.occurrenceId == Occurrence.id,
                Identification.isCurrent.is_(True),
            ),
        )
        .outerjoin(Taxon, Taxon.id == Identification.taxonId)
    )

    count_select = (
        select(Occurrence.id)
        .join(Collection, Occurrence.collectionId == Collection.id)
        .outerjoin(
            Identification,
            and_(
                Identification.occurrenceId == Occurrence.id,
                Identification.isCurrent.is_(True),
            ),
        )
        .outerjoin(Taxon, Taxon.id == Identification.taxonId)
    )

    # Permisos
    if not is_superuser:
        perm_subq = (
            select(CollectionPermission.collectionId)
            .where(
                CollectionPermission.userId == current_user.id,
                CollectionPermission.role.in_(["viewer", "editor", "owner"]),
            )
        )

        conds = [Occurrence.collectionId.in_(perm_subq)]

        if is_inst_admin and user_inst_id:
            conds.append(Collection.institutionId == user_inst_id)

        base_select = base_select.where(or_(*conds))
        count_select = count_select.where(or_(*conds))

    # Filtrar por colección específica
    if collection_id is not None:
        base_select = base_select.where(Occurrence.collectionId == collection_id)
        count_select = count_select.where(Occurrence.collectionId == collection_id)

    # Filtro de texto
    if q:
        like = f"%{q.strip()}%"
        text_filter = or_(
            code_expr.ilike(like),
            Taxon.scientificName.ilike(like),
            Taxon.family.ilike(like),
            location_expr.ilike(like),
            Occurrence.recordedBy.ilike(like),
        )
        base_select = base_select.where(text_filter)
        count_select = count_select.where(text_filter)

    # Paginación: adaptamos page/page_size a limit/offset y usamos Page[T]
    limit = page_size
    offset = (page - 1) * page_size

    total = db.scalar(select(func.count()).select_from(count_select.subquery())) or 0

    rows = db.execute(
        base_select
        .order_by(Occurrence.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    items: List[OccurrenceBriefItem] = []
    for row in rows:
        items.append(
            OccurrenceBriefItem(
                id=row.occ_id,
                code=row.code,
                scientificName=row.scientific_name,
                family=row.family,
                location=row.location,
                collector=row.collector,
                date=_fmt_dt(row.date),
            )
        )

    total_pages, current_page, remaining_pages = _page_meta(total, limit, offset)

    return Page[OccurrenceBriefItem](
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        currentPage=current_page,
        totalPages=total_pages,
        remainingPages=remaining_pages,
    )



@router.patch(
    "/{occurrence_id}/dynamic-properties",
    response_model=OccurrenceOut,
    status_code=status.HTTP_200_OK,
    summary="Actualiza dynamicProperties (JSON) de una ocurrencia",
)
def set_dynamic_properties(
    occurrence_id: int,
    payload: DynamicPropsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.collection),
            selectinload(Occurrence.agents),
            selectinload(Occurrence.identifications)
            .selectinload(Identification.identifiers),
            selectinload(Occurrence.identifications)
            .selectinload(Identification.taxon),
        )
        .where(Occurrence.id == occurrence_id)
    )
    occ = db.scalar(stmt)
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")

    if not occ.collection:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied (occurrence without collection)",
        )

    if not _user_can_edit_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough privileges")

    # Normalizar entrada a dict o None
    dp = payload.dynamicProperties
    obj: Optional[Dict[str, Any]] = None

    if isinstance(dp, dict):
        obj = dp
    elif isinstance(dp, str):
        s = dp.strip()
        if s:
            try:
                parsed = json.loads(s)
                if not isinstance(parsed, dict):
                    raise ValueError("dynamicProperties debe ser un objeto JSON")
                obj = parsed
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="dynamicProperties no es un JSON válido",
                )
        else:
            obj = None
    else:
        obj = None

    occ.dynamicProperties = obj

    db.add(occ)
    db.commit()
    db.refresh(occ)

    return OccurrenceOut.model_validate(occ, from_attributes=True)
