# routers/collections.py
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_, or_, func, exists
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel

from backend.config.database import get_db
from backend.auth.jwt import get_current_user
from backend.models.models import (
    Collection,
    CollectionPermission,
    Institution,
    Agent,
    User,
    Occurrence,
)

try:
    # Pydantic v2
    from pydantic import ConfigDict
    _HAS_V2 = True
except Exception:
    _HAS_V2 = False


router = APIRouter(prefix="/collections", tags=["Collections"])


# ------------------- Schemas -------------------

class InstitutionOut(BaseModel):
    id: int
    institutionCode: Optional[str] = None
    institutionName: Optional[str] = None

    if _HAS_V2:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True


class AgentOut(BaseModel):
    id: int
    fullName: Optional[str] = None
    orcid: Optional[str] = None

    if _HAS_V2:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True


class CollectionOut(BaseModel):
    id: int
    collectionID: Optional[str] = None
    collectionCode: Optional[str] = None
    collectionName: Optional[str] = None
    description: Optional[str] = None
    webSite: Optional[str] = None
    institution: Optional[InstitutionOut] = None
    creator: AgentOut
    my_role: Optional[str] = None
    occurrencesCount: int = 0

    if _HAS_V2:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True


class CollectionsPage(BaseModel):
    items: List[CollectionOut]
    total: int
    total_pages: int
    limit: int
    offset: int
    remaining_pages: int


class CollectionCreate(BaseModel):
    collectionID: Optional[str] = None
    collectionCode: Optional[str] = None
    collectionName: Optional[str] = None
    description: Optional[str] = None
    webSite: Optional[str] = None
    # Opcionales: por defecto se toman del usuario actual
    institution_id: Optional[int] = None
    creator_agent_id: Optional[int] = None

    if _HAS_V2:
        model_config = ConfigDict(extra="forbid")


# ------------------- Helpers de autorización y paginación -------------------

def build_access_filter(current_user: User):
    """
    Filtro OR que define los accesos implícitos/explicitos:
    - Permiso explícito para el current_user (EXISTS)
    - Si es admin de institución: colecciones de su institución
    - Si tiene agent_id: colecciones creadas por su propio agent
    """
    # permiso explícito: existe un CP para este user y esta colección
    perm_exists = exists(
        select(1).where(
            and_(
                CollectionPermission.collection_id == Collection.id,
                CollectionPermission.user_id == current_user.id,
            )
        )
    )

    clauses = [perm_exists]

    if current_user.is_institution_admin and current_user.institution_id is not None:
        clauses.append(Collection.institution_id == current_user.institution_id)

    if current_user.agent_id is not None:
        clauses.append(Collection.creator_agent_id == current_user.agent_id)

    return or_(*clauses)


def _paginate_total(db: Session, ids_query):
    """
    Calcula el total a partir de una query de IDs (select(Collection.id) ...).
    Usa DISTINCT por robustez ante cualquier duplicado accidental.
    """
    subq = ids_query.subquery()
    total = db.execute(select(func.count(func.distinct(subq.c.id)))).scalar_one()
    return total


def _bounds(limit: int, offset: int):
    limit = max(1, min(limit or 20, 200))  # límite sensato (1..200)
    offset = max(0, offset or 0)
    return limit, offset


def _page_metrics(total: int, limit: int, offset: int):
    if total == 0:
        total_pages = 0
        current_page = 0
        remaining_pages = 0
    else:
        total_pages = (total + limit - 1) // limit
        current_page = min(total_pages, (offset // limit) + 1)
        remaining_pages = max(0, total_pages - current_page)
    return total_pages, remaining_pages


# ------------------- Endpoints -------------------

@router.get(
    "/by-agent/{agent_id}",
    response_model=CollectionsPage,
    summary="Listar colecciones creadas por un Agent (respetando permisos del usuario actual), paginadas",
)
def get_collections_by_agent(
    agent_id: int,
    limit: int = Query(20, ge=1, le=200, description="Límite de ítems por página"),
    offset: int = Query(0, ge=0, description="Desplazamiento (items a saltar)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Siempre lista SOLO colecciones cuyo creator_agent_id == agent_id.
    - Superuser: ve todas las de ese agent_id.
    - Institution admin / usuario normal: solo las que tiene acceso (permiso explícito, implícito por institución o por ser el creador).
    """
    limit, offset = _bounds(limit, offset)

    # Subquery de conteos de ocurrencias
    occ_counts = (
        select(
            Occurrence.collection_id.label("collection_id"),
            func.count(Occurrence.id).label("occ_count"),
        )
        .group_by(Occurrence.collection_id)
        .subquery()
    )

    # --- IDs base para conteo/paginación ---
    if current_user.is_superuser:
        ids_q = select(Collection.id).where(Collection.creator_agent_id == agent_id)
    else:
        access_filter = build_access_filter(current_user)
        ids_q = (
            select(Collection.id)
            .where(
                and_(
                    Collection.creator_agent_id == agent_id,
                    access_filter,
                )
            )
        )

    total = _paginate_total(db, ids_q)
    ids_subq = ids_q.subquery()

    # Subquery: rol explícito deduplicado por colección para el current_user
    cp_role_sq = (
        select(
            CollectionPermission.collection_id.label("cid"),
            func.max(CollectionPermission.role).label("role"),
        )
        .where(CollectionPermission.user_id == current_user.id)
        .group_by(CollectionPermission.collection_id)
        .subquery()
    )

    # --- Items paginados ---
    q = (
        select(
            Collection,
            cp_role_sq.c.role,         # rol explícito si existe (dedupe)
            occ_counts.c.occ_count,
        )
        .join(ids_subq, ids_subq.c.id == Collection.id)
        .join(occ_counts, occ_counts.c.collection_id == Collection.id, isouter=True)
        .join(cp_role_sq, cp_role_sq.c.cid == Collection.id, isouter=True)
        .options(
            selectinload(Collection.institution),
            selectinload(Collection.creator),
        )
        .order_by(Collection.collectionName.nulls_last())
        .offset(offset)
        .limit(limit)
    )

    rows = db.execute(q).all()
    items: List[CollectionOut] = []
    for col, role, occ_count in rows:
        if current_user.is_superuser:
            my_role = "superuser"
        elif role:
            my_role = role
        elif current_user.is_institution_admin and current_user.institution_id == col.institution_id:
            my_role = "institution_admin"
        else:
            my_role = None

        items.append(
            CollectionOut(
                id=col.id,
                collectionID=col.collectionID,
                collectionCode=col.collectionCode,
                collectionName=col.collectionName,
                description=col.description,
                webSite=col.webSite,
                institution=col.institution,
                creator=col.creator,
                my_role=my_role,
                occurrencesCount=occ_count or 0,
            )
        )

    total_pages, remaining_pages = _page_metrics(total, limit, offset)
    return CollectionsPage(
        items=items,
        total=total,
        total_pages=total_pages,
        limit=limit,
        offset=offset,
        remaining_pages=remaining_pages,
    )


@router.get(
    "/allowed",
    response_model=CollectionsPage,
    summary="Listar colecciones permitidas para el usuario actual (superuser: todas; institution admin: todas de su institución; usuario: permisos explícitos), paginadas",
)
def get_collections_allowed(
    limit: int = Query(20, ge=1, le=200, description="Límite de ítems por página"),
    offset: int = Query(0, ge=0, description="Desplazamiento (items a saltar)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve colecciones 'permitidas':
    - Superuser: TODAS (my_role = 'superuser').
    - Institution admin: TODAS las de su institución (my_role = 'institution_admin' si no hay permiso explícito).
    - Usuario normal: solo colecciones con permiso explícito (my_role = rol explícito).
    """
    limit, offset = _bounds(limit, offset)

    # Subquery de conteos de ocurrencias
    occ_counts = (
        select(
            Occurrence.collection_id.label("collection_id"),
            func.count(Occurrence.id).label("occ_count"),
        )
        .group_by(Occurrence.collection_id)
        .subquery()
    )

    # --- IDs base según tipo de usuario ---
    if current_user.is_superuser:
        ids_q = select(Collection.id)
    elif current_user.is_institution_admin and current_user.institution_id is not None:
        ids_q = select(Collection.id).where(
            Collection.institution_id == current_user.institution_id
        )
    else:
        # Usuario normal: requiere permiso explícito
        ids_q = (
            select(Collection.id)
            .join(CollectionPermission, CollectionPermission.collection_id == Collection.id)
            .where(CollectionPermission.user_id == current_user.id)
            .group_by(Collection.id)
        )

    total = _paginate_total(db, ids_q)
    ids_subq = ids_q.subquery()

    # Subquery: rol explícito deduplicado por colección para el current_user
    cp_role_sq = (
        select(
            CollectionPermission.collection_id.label("cid"),
            func.max(CollectionPermission.role).label("role"),
        )
        .where(CollectionPermission.user_id == current_user.id)
        .group_by(CollectionPermission.collection_id)
        .subquery()
    )

    # --- Items paginados ---
    q = (
        select(
            Collection,
            cp_role_sq.c.role,         # rol explícito si existe (dedupe)
            occ_counts.c.occ_count,
        )
        .join(ids_subq, ids_subq.c.id == Collection.id)
        .join(occ_counts, occ_counts.c.collection_id == Collection.id, isouter=True)
        .join(cp_role_sq, cp_role_sq.c.cid == Collection.id, isouter=True)
        .options(
            selectinload(Collection.institution),
            selectinload(Collection.creator),
        )
        .order_by(Collection.collectionName.nulls_last())
        .offset(offset)
        .limit(limit)
    )

    rows = db.execute(q).all()
    items: List[CollectionOut] = []
    for col, role, occ_count in rows:
        if current_user.is_superuser:
            my_role = "superuser"
        elif role:
            my_role = role
        elif current_user.is_institution_admin and current_user.institution_id == col.institution_id:
            my_role = "institution_admin"
        else:
            my_role = None

        items.append(
            CollectionOut(
                id=col.id,
                collectionID=col.collectionID,
                collectionCode=col.collectionCode,
                collectionName=col.collectionName,
                description=col.description,
                webSite=col.webSite,
                institution=col.institution,
                creator=col.creator,
                my_role=my_role,
                occurrencesCount=occ_count or 0,
            )
        )

    total_pages, remaining_pages = _page_metrics(total, limit, offset)
    return CollectionsPage(
        items=items,
        total=total,
        total_pages=total_pages,
        limit=limit,
        offset=offset,
        remaining_pages=remaining_pages,
    )


@router.post(
    "",
    response_model=CollectionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una colección (requiere usuario activo)"
)
def create_collection(
    payload: CollectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verificar usuario activo
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo: no puede crear colecciones."
        )

    # Resolver institución y agente creador por defecto
    institution_id = payload.institution_id or current_user.institution_id
    creator_agent_id = payload.creator_agent_id or current_user.agent_id

    if creator_agent_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay Agent asociado al usuario. Asigna un Agent al usuario o proporciona 'creator_agent_id'."
        )

    # Reglas de seguridad para no-superusers
    if not current_user.is_superuser:
        if payload.institution_id and payload.institution_id != current_user.institution_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes crear colecciones en otra institución."
            )
        if payload.creator_agent_id and payload.creator_agent_id != current_user.agent_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes establecer otro Agent como creador."
            )

    # collectionID único
    if payload.collectionID:
        dup = db.execute(
            select(Collection).where(Collection.collectionID == payload.collectionID)
        ).scalar_one_or_none()
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una colección con ese 'collectionID'."
            )

    # Crear la colección
    col = Collection(
        collectionID=payload.collectionID,
        collectionCode=payload.collectionCode,
        collectionName=payload.collectionName,
        description=payload.description,
        webSite=payload.webSite,
        institution_id=institution_id,
        creator_agent_id=creator_agent_id,
    )
    db.add(col)
    db.flush()  # para obtener col.id

    # Conceder permiso 'owner' al creador (usuario actual)
    db.add(CollectionPermission(
        collection_id=col.id,
        user_id=current_user.id,
        role="owner",
        granted_by_user_id=current_user.id,
    ))

    db.commit()

    # Recargar con relaciones
    col = db.execute(
        select(Collection)
        .where(Collection.id == col.id)
        .options(
            selectinload(Collection.institution),
            selectinload(Collection.creator),
        )
    ).scalar_one()

    # Recién creada: sin ocurrencias
    return CollectionOut(
        id=col.id,
        collectionID=col.collectionID,
        collectionCode=col.collectionCode,
        collectionName=col.collectionName,
        description=col.description,
        webSite=col.webSite,
        institution=col.institution,
        creator=col.creator,
        my_role="owner",
        occurrencesCount=0,
    )
