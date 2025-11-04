# routers/collections.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, and_, or_, func

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
from pydantic import BaseModel
try:
    # Pydantic v2
    from pydantic import ConfigDict
    _HAS_V2 = True
except Exception:
    _HAS_V2 = False

router = APIRouter(prefix="/collections", tags=["collections"])

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


# ------------------- Helpers de autorización -------------------

def build_access_filter(current_user: User):
    # permiso explícito (se usará con join filtrado por user en no-superuser)
    clauses = [CollectionPermission.user_id == current_user.id]

    if current_user.is_institution_admin:
        clauses.append(Collection.institution_id == current_user.institution_id)

    if current_user.agent_id is not None:
        clauses.append(Collection.creator_agent_id == current_user.agent_id)

    return or_(*clauses)


# ------------------- Endpoints -------------------

@router.get(
    "/by-agent/{agent_id}",
    response_model=List[CollectionOut],
    summary="Listar colecciones creadas por un Agent (respetando permisos del usuario actual)",
)
def get_collections_by_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Subquery de conteos de ocurrencias
    occ_counts = (
        select(
            Occurrence.collection_id.label("collection_id"),
            func.count(Occurrence.id).label("occ_count"),
        )
        .group_by(Occurrence.collection_id)
        .subquery()
    )

    # Superusuario: puede ver todo lo del agent_id
    if current_user.is_superuser:
        q = (
            select(
                Collection,
                occ_counts.c.occ_count,
            )
            .join(occ_counts, occ_counts.c.collection_id == Collection.id, isouter=True)
            .where(Collection.creator_agent_id == agent_id)
            .options(
                selectinload(Collection.institution),
                selectinload(Collection.creator),
            )
            .order_by(Collection.collectionName.nullslast())
        )
        rows = db.execute(q).all()
        return [
            CollectionOut(
                id=c.id,
                collectionID=c.collectionID,
                collectionCode=c.collectionCode,
                collectionName=c.collectionName,
                description=c.description,
                webSite=c.webSite,
                institution=c.institution,
                creator=c.creator,
                my_role=None,
                occurrencesCount=occ_count or 0,
            )
            for c, occ_count in rows
        ]

    # Resto de usuarios: aplicar filtro de acceso
    access_filter = build_access_filter(current_user)

    # JOIN a permisos solo para el usuario actual dentro del join (evita duplicados)
    cp_join = and_(
        CollectionPermission.collection_id == Collection.id,
        CollectionPermission.user_id == current_user.id,
    )

    q = (
        select(
            Collection,
            CollectionPermission.role,   # puede ser None si acceso implícito
            occ_counts.c.occ_count,
        )
        .join(CollectionPermission, cp_join, isouter=True)
        .join(occ_counts, occ_counts.c.collection_id == Collection.id, isouter=True)
        .where(
            and_(
                Collection.creator_agent_id == agent_id,
                access_filter,
            )
        )
        .options(
            selectinload(Collection.institution),
            selectinload(Collection.creator),
        )
        .order_by(Collection.collectionName.nullslast())
    )

    rows = db.execute(q).all()
    out: List[CollectionOut] = []
    for col, role, occ_count in rows:
        out.append(
            CollectionOut(
                id=col.id,
                collectionID=col.collectionID,
                collectionCode=col.collectionCode,
                collectionName=col.collectionName,
                description=col.description,
                webSite=col.webSite,
                institution=col.institution,
                creator=col.creator,
                my_role=role,                           # None si acceso implícito
                occurrencesCount=occ_count or 0,
            )
        )
    return out


@router.get(
    "/allowed",
    response_model=List[CollectionOut],
    summary="Listar colecciones con permiso explícito para el usuario actual",
)
def get_collections_with_permission(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Subquery de conteos
    occ_counts = (
        select(
            Occurrence.collection_id.label("collection_id"),
            func.count(Occurrence.id).label("occ_count"),
        )
        .group_by(Occurrence.collection_id)
        .subquery()
    )

    q = (
        select(
            Collection,
            CollectionPermission.role,
            occ_counts.c.occ_count,
        )
        .join(CollectionPermission, CollectionPermission.collection_id == Collection.id)
        .join(occ_counts, occ_counts.c.collection_id == Collection.id, isouter=True)
        .where(CollectionPermission.user_id == current_user.id)
        .options(
            selectinload(Collection.institution),
            selectinload(Collection.creator),
        )
        .order_by(Collection.collectionName.nullslast())
    )
    rows = db.execute(q).all()

    return [
        CollectionOut(
            id=col.id,
            collectionID=col.collectionID,
            collectionCode=col.collectionCode,
            collectionName=col.collectionName,
            description=col.description,
            webSite=col.webSite,
            institution=col.institution,
            creator=col.creator,
            my_role=role,
            occurrencesCount=occ_count or 0,
        )
        for col, role, occ_count in rows
    ]


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
