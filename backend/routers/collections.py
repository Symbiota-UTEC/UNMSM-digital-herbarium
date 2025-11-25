# backend/routers/collections.py
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_, or_, func, case
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError

from backend.config.database import get_db
from backend.auth.jwt import get_current_user
from backend.models.models import (
    Collection,
    CollectionPermission,
    Institution,
    User,
    Occurrence,
    Taxon,
    Identification,
)
from backend.schemas.common.pages import Page
from backend.schemas.collections import (
    CollectionOut,
    CollectionCreate,
    CollectionAccessUser,
    AddUserToCollectionBody,
    CollectionPermissionOut,
)
from backend.schemas.occurrence import OccurrenceBriefItem


router = APIRouter(prefix="/collections", tags=["Collections"])


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
        remaining_pages = 0
    else:
        total_pages = (total + limit - 1) // limit
        current_page = min(total_pages, (offset // limit) + 1)
        remaining_pages = max(0, total_pages - current_page)
    return total_pages, remaining_pages


# ------------------- Endpoints -------------------


@router.get(
    "/allowed",
    response_model=Page[CollectionOut],
    summary=(
        "Listar colecciones permitidas para el usuario actual "
        "(superuser: todas; institution admin: todas de su institución; usuario: permisos explícitos), paginadas"
    ),
)
def get_collections_allowed(
    limit: int = Query(20, ge=1, le=200, description="Límite de ítems por página"),
    offset: int = Query(0, ge=0, description="Desplazamiento (items a saltar)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve colecciones 'permitidas':
    - Superuser: TODAS (myRole = 'superuser').
    - Institution admin: TODAS las de su institución (myRole = 'institution_admin' si no hay permiso explícito).
    - Usuario normal: solo colecciones con permiso explícito (myRole = rol explícito).
    """
    limit, offset = _bounds(limit, offset)

    # Subquery de conteos de ocurrencias
    occ_counts = (
        select(
            Occurrence.collectionId.label("collection_id"),
            func.count(Occurrence.id).label("occ_count"),
        )
        .group_by(Occurrence.collectionId)
        .subquery()
    )

    # --- IDs base según tipo de usuario ---
    if current_user.isSuperuser:
        ids_q = select(Collection.id)
    elif current_user.isInstitutionAdmin and current_user.institutionId is not None:
        ids_q = select(Collection.id).where(
            Collection.institutionId == current_user.institutionId
        )
    else:
        # Usuario normal: requiere permiso explícito
        ids_q = (
            select(Collection.id)
            .join(
                CollectionPermission,
                CollectionPermission.collectionId == Collection.id,
            )
            .where(CollectionPermission.userId == current_user.id)
            .group_by(Collection.id)
        )

    total = _paginate_total(db, ids_q)
    ids_subq = ids_q.subquery()

    # Subquery: rol explícito deduplicado por colección para el current_user
    cp_role_sq = (
        select(
            CollectionPermission.collectionId.label("cid"),
            func.max(CollectionPermission.role).label("role"),
        )
        .where(CollectionPermission.userId == current_user.id)
        .group_by(CollectionPermission.collectionId)
        .subquery()
    )

    # --- Items paginados ---
    q = (
        select(
            Collection,
            cp_role_sq.c.role,  # rol explícito si existe (dedupe)
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
        if current_user.isSuperuser:
            my_role = "superuser"
        elif role:
            my_role = role
        elif (
            current_user.isInstitutionAdmin
            and current_user.institutionId == col.institutionId
        ):
            my_role = "institution_admin"
        else:
            my_role = None

        items.append(
            CollectionOut(
                id=col.id,
                collectionCode=col.collectionCode,
                collectionName=col.collectionName,
                description=col.description,
                institution=col.institution,
                creator=col.creator,
                myRole=my_role,
                occurrencesCount=occ_count or 0,
            )
        )

    total_pages, remaining_pages = _page_metrics(total, limit, offset)
    current_page = (offset // limit) + 1 if limit > 0 else 1

    return Page[CollectionOut](
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        currentPage=current_page,
        totalPages=total_pages,
        remainingPages=remaining_pages,
    )


@router.get(
    "/by-user/{user_id}",
    response_model=Page[CollectionOut],
    summary=(
        "Listar colecciones creadas por un usuario (paginado). "
        "Los usuarios normales solo pueden ver sus propias colecciones; "
        "el superuser puede ver las de cualquier usuario."
    ),
)
def get_collections_by_user(
    user_id: int,
    limit: int = Query(20, ge=1, le=200, description="Límite de ítems por página"),
    offset: int = Query(0, ge=0, description="Desplazamiento (items a saltar)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Colecciones donde creatorUserId == user_id.

    - current_user superuser: puede consultar cualquier user_id.
    - resto de usuarios: solo pueden consultar su propio user_id.
    """
    limit, offset = _bounds(limit, offset)

    # Autorización básica
    if not current_user.isSuperuser and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes listar las colecciones que tú mismo has creado.",
        )

    # Subquery de conteos de ocurrencias
    occ_counts = (
        select(
            Occurrence.collectionId.label("collection_id"),
            func.count(Occurrence.id).label("occ_count"),
        )
        .group_by(Occurrence.collectionId)
        .subquery()
    )

    # IDs: colecciones cuyo creador es user_id
    ids_q = select(Collection.id).where(Collection.creatorUserId == user_id)
    total = _paginate_total(db, ids_q)
    ids_subq = ids_q.subquery()

    # Subquery: rol explícito del current_user en esas colecciones
    cp_role_sq = (
        select(
            CollectionPermission.collectionId.label("cid"),
            func.max(CollectionPermission.role).label("role"),
        )
        .where(CollectionPermission.userId == current_user.id)
        .group_by(CollectionPermission.collectionId)
        .subquery()
    )

    q = (
        select(
            Collection,
            cp_role_sq.c.role,
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
        if current_user.isSuperuser:
            my_role = "superuser"
        elif role:
            my_role = role
        elif (
            current_user.isInstitutionAdmin
            and current_user.institutionId == col.institutionId
        ):
            my_role = "institution_admin"
        else:
            my_role = None

        items.append(
            CollectionOut(
                id=col.id,
                collectionCode=col.collectionCode,
                collectionName=col.collectionName,
                description=col.description,
                institution=col.institution,
                creator=col.creator,
                myRole=my_role,
                occurrencesCount=occ_count or 0,
            )
        )

    total_pages, remaining_pages = _page_metrics(total, limit, offset)
    current_page = (offset // limit) + 1 if limit > 0 else 1

    return Page[CollectionOut](
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        currentPage=current_page,
        totalPages=total_pages,
        remainingPages=remaining_pages,
    )


@router.post(
    "",
    response_model=CollectionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una colección (requiere usuario activo)",
)
def create_collection(
    payload: CollectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verificar usuario activo
    if not current_user.isActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo: no puede crear colecciones.",
        )

    # Resolver institución por defecto desde el usuario
    institution_id = payload.institutionId or current_user.institutionId

    # Reglas de seguridad para no-superusers
    if not current_user.isSuperuser:
        if payload.institutionId and payload.institutionId != current_user.institutionId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes crear colecciones en otra institución.",
            )

    # Crear la colección (creador = current_user)
    col = Collection(
        collectionCode=payload.collectionCode,
        collectionName=payload.collectionName,
        description=payload.description,
        institutionId=institution_id,
        creatorUserId=current_user.id,
    )
    db.add(col)
    db.flush()  # para obtener col.id

    # Conceder permiso 'owner' al creador (usuario actual)
    db.add(
        CollectionPermission(
            collectionId=col.id,
            userId=current_user.id,
            role="owner",
            grantedByUserId=current_user.id,
        )
    )

    db.commit()

    # Recargar con relaciones
    col = (
        db.execute(
            select(Collection)
            .where(Collection.id == col.id)
            .options(
                selectinload(Collection.institution),
                selectinload(Collection.creator),
            )
        )
        .scalar_one()
    )

    # Recién creada: sin ocurrencias
    return CollectionOut(
        id=col.id,
        collectionCode=col.collectionCode,
        collectionName=col.collectionName,
        description=col.description,
        institution=col.institution,
        creator=col.creator,
        myRole="owner",
        occurrencesCount=0,
    )


def _current_user_role_in_collection(
    db: Session, collection_id: int, user_id: int
) -> Optional[str]:
    return db.execute(
        select(CollectionPermission.role).where(
            CollectionPermission.collectionId == collection_id,
            CollectionPermission.userId == user_id,
        )
    ).scalar_one_or_none()


@router.get(
    "/{collection_id}/access-users",
    response_model=Page[CollectionAccessUser],
    summary="Usuarios con acceso a una colección (paginado)",
)
def list_collection_access_users(
    collection_id: int,
    q: Optional[str] = Query(None, description="Texto a buscar en nombre o correo"),
    role: Optional[Literal["viewer", "editor", "owner"]] = Query(
        None, description="Filtrar por rol exacto"
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1) Validar colección
    collection = db.execute(
        select(Collection).where(Collection.id == collection_id)
    ).scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Colección no encontrada")

    # 2) Autorización
    if current_user.isSuperuser:
        pass
    elif current_user.isInstitutionAdmin:
        if collection.institutionId != current_user.institutionId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para ver accesos de esta colección",
            )
    else:
        has_permission = db.execute(
            select(CollectionPermission.id).where(
                CollectionPermission.collectionId == collection_id,
                CollectionPermission.userId == current_user.id,
            )
        ).scalar_one_or_none()
        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para ver accesos de esta colección",
            )

    name_expr = func.coalesce(User.fullName, User.username)

    role_order = case(
        (CollectionPermission.role == "owner", 0),
        (CollectionPermission.role == "editor", 1),
        else_=2,
    )

    base_where = [CollectionPermission.collectionId == collection_id]
    if role:
        base_where.append(CollectionPermission.role == role)
    if q:
        like_lower = f"%{q.strip().lower()}%"
        base_where.append(
            or_(
                func.lower(name_expr).like(like_lower),
                func.lower(User.email).like(like_lower),
            )
        )

    total_subq = (
        select(User.id)
        .join(CollectionPermission, CollectionPermission.userId == User.id)
        .outerjoin(Institution, Institution.id == User.institutionId)
        .where(*base_where)
        .subquery()
    )
    total = db.execute(select(func.count()).select_from(total_subq)).scalar_one()

    items_stmt = (
        select(
            name_expr.label("full_name"),
            User.email.label("email"),
            Institution.institutionName.label("institution_name"),
            CollectionPermission.role.label("role"),
        )
        .join(CollectionPermission, CollectionPermission.userId == User.id)
        .outerjoin(Institution, Institution.id == User.institutionId)
        .where(*base_where)
        .order_by(role_order, func.lower(name_expr))
        .limit(limit)
        .offset(offset)
    )

    rows = db.execute(items_stmt).all()
    items = [
        CollectionAccessUser(
            fullName=row.full_name,
            email=row.email,
            institution=row.institution_name,
            role=row.role,
        )
        for row in rows
    ]

    total_pages, remaining_pages = _page_metrics(total, limit, offset)
    current_page = (offset // limit) + 1 if limit > 0 else 1

    return Page[CollectionAccessUser](
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        currentPage=current_page,
        totalPages=total_pages,
        remainingPages=remaining_pages,
    )


@router.get(
    "/{collection_id}/occurrences/brief",
    response_model=Page[OccurrenceBriefItem],
    summary="Ocurrencias por ID de colección (breve, paginado)",
)
def list_occurrences_brief_by_collection_id(
    collection_id: int,
    q: Optional[str] = Query(
        None,
        description=(
            "Buscar en código, nombre científico, familia, ubicación o recolector"
        ),
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1) Colección
    collection = db.execute(
        select(Collection).where(Collection.id == collection_id)
    ).scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Colección no encontrada")

    # 2) Autorización
    if current_user.isSuperuser:
        pass
    elif current_user.isInstitutionAdmin:
        if collection.institutionId != current_user.institutionId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para ver ocurrencias de esta colección",
            )
    else:
        has_perm = db.execute(
            select(CollectionPermission.id).where(
                CollectionPermission.collectionId == collection_id,
                CollectionPermission.userId == current_user.id,
            )
        ).scalar_one_or_none()
        if not has_perm:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para ver ocurrencias de esta colección",
            )

    # 3) Expresiones para campos
    code_expr = func.coalesce(Occurrence.catalogNumber, Occurrence.recordNumber)
    sci_name_expr = Taxon.scientificName
    family_expr = Taxon.family
    location_expr = func.coalesce(
        Occurrence.locality,
        Occurrence.municipality,
        Occurrence.stateProvince,
        Occurrence.country,
    )
    collector_expr = Occurrence.recordedBy
    date_expr = Occurrence.eventDate

    filters = [Occurrence.collectionId == collection_id]

    if q:
        like = f"%{q.strip().lower()}%"
        filters.append(
            or_(
                func.lower(code_expr).like(like),
                func.lower(sci_name_expr).like(like),
                func.lower(family_expr).like(like),
                func.lower(location_expr).like(like),
                func.lower(collector_expr).like(like),
            )
        )

    # 4) Total (join con Identification isCurrent=True y Taxon)
    total_subq = (
        select(Occurrence.id)
        .outerjoin(
            Identification,
            and_(
                Identification.occurrenceId == Occurrence.id,
                Identification.isCurrent.is_(True),
            ),
        )
        .outerjoin(Taxon, Taxon.id == Identification.taxonId)
        .where(*filters)
        .subquery()
    )
    total = db.execute(select(func.count()).select_from(total_subq)).scalar_one()

    # 5) Items paginados
    items_stmt = (
        select(
            Occurrence.id.label("id"),
            code_expr.label("code"),
            sci_name_expr.label("scientific_name"),
            family_expr.label("family"),
            location_expr.label("location"),
            collector_expr.label("collector"),
            date_expr.label("date"),
        )
        .outerjoin(
            Identification,
            and_(
                Identification.occurrenceId == Occurrence.id,
                Identification.isCurrent.is_(True),
            ),
        )
        .outerjoin(Taxon, Taxon.id == Identification.taxonId)
        .where(*filters)
        .order_by(
            Occurrence.year.desc().nulls_last(),
            Occurrence.month.desc().nulls_last(),
            Occurrence.day.desc().nulls_last(),
            code_expr.asc().nulls_last(),
        )
        .limit(limit)
        .offset(offset)
    )

    rows = db.execute(items_stmt).all()
    items = [
        OccurrenceBriefItem(
            id=r.id,
            code=r.code,
            scientificName=r.scientific_name,
            family=r.family,
            location=r.location,
            collector=r.collector,
            date=r.date,
        )
        for r in rows
    ]

    total_pages, remaining_pages = _page_metrics(total, limit, offset)
    current_page = (offset // limit) + 1 if limit > 0 else 1

    return Page[OccurrenceBriefItem](
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        currentPage=current_page,
        totalPages=total_pages,
        remainingPages=remaining_pages,
    )


# ------------------- Gestión de permisos en colecciones -------------------


@router.post(
    "/{collection_id}/permissions/add-user",
    response_model=CollectionPermissionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar usuario (por email) a una colección con rol viewer/editor",
)
def add_user_to_collection(
    collection_id: int,
    payload: AddUserToCollectionBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1) Colección
    collection = db.execute(
        select(Collection).where(Collection.id == collection_id)
    ).scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Colección no encontrada")

    # 2) Autorización (SOLO superuser, admin de su institución o owner)
    if current_user.isSuperuser:
        pass
    elif current_user.isInstitutionAdmin:
        if collection.institutionId != current_user.institutionId:
            raise HTTPException(
                status_code=403,
                detail="No puedes gestionar permisos de una colección de otra institución",
            )
    else:
        my_role = _current_user_role_in_collection(db, collection_id, current_user.id)
        if my_role != "owner":
            raise HTTPException(
                status_code=403,
                detail="Se requiere rol 'owner' en la colección para agregar usuarios",
            )

    # 3) Usuario objetivo por email (case-insensitive)
    target = db.execute(
        select(User).where(User.email.ilike(payload.email))
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario (email) no encontrado")
    if not target.isActive:
        raise HTTPException(
            status_code=400, detail="Usuario inactivo: no puede ser agregado"
        )

    # 4) Insertar permiso con rol viewer/editor (409 si ya existe cualquier rol)
    perm = CollectionPermission(
        collectionId=collection_id,
        userId=target.id,
        role=payload.role,
        grantedByUserId=current_user.id,
    )
    try:
        db.add(perm)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing_role = db.execute(
            select(CollectionPermission.role).where(
                CollectionPermission.collectionId == collection_id,
                CollectionPermission.userId == target.id,
            )
        ).scalar_one_or_none()
        if existing_role:
            raise HTTPException(
                status_code=409,
                detail=(
                    "El usuario ya tiene acceso a esta colección "
                    f"con rol '{existing_role}'"
                ),
            )
        raise

    return CollectionPermissionOut(
        collectionId=collection_id,
        userId=target.id,
        email=target.email,
        role=payload.role,
    )
