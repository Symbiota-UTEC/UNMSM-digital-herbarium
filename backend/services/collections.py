# backend/services/collections.py
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.models.enums import CollectionAccess, CollectionRole, EffectiveRole
from backend.models.models import (
    Collection,
    CollectionPermission,
    Identification,
    Institution,
    Occurrence,
    Taxon,
    User,
)
from backend.schemas.collections import (
    AddUserToCollectionBody,
    CollectionAccessUser,
    CollectionCreate,
    CollectionOut,
    CollectionPermissionOut,
)
from backend.schemas.common.pages import Page
from backend.schemas.occurrence import OccurrenceBriefItem
from backend.services.collection_permissions import (
    collection_capabilities,
    get_user_role_in_collection,
    my_role_label,
    user_can_manage_collection_permissions,
    user_can_view_collection,
)


def _paginate_total(db: Session, ids_query):
    """
    Calcula el total a partir de una query de IDs (select(Collection.collectionId) ...).
    """
    subq = ids_query.subquery()
    total = db.execute(select(func.count()).select_from(subq)).scalar_one()
    return total


def _bounds(limit: int, offset: int):
    limit = max(1, min(limit or 20, 200))  # límite sensato (1..200)
    offset = max(0, offset or 0)
    return limit, offset


def _collection_out(
    current_user: User, col: Collection, role: Optional[CollectionRole], occ_count: Optional[int]
) -> CollectionOut:
    caps = collection_capabilities(current_user, col, role)
    return CollectionOut(
        collectionId=col.collectionId,
        collectionName=col.collectionName,
        description=col.description,
        institution=col.institution,
        creator=col.creator,
        myRole=my_role_label(current_user, col, role),
        canEdit=caps.can_edit,
        canManage=caps.can_manage,
        occurrencesCount=occ_count or 0,
    )


def get_collection(db: Session, collection_id: UUID, current_user: User) -> CollectionOut:
    col = db.scalar(
        select(Collection)
        .options(selectinload(Collection.institution), selectinload(Collection.creator))
        .where(Collection.collectionId == collection_id)
    )
    if not col:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")

    role = get_user_role_in_collection(db, col.collectionId, current_user.userId)
    if not collection_capabilities(current_user, col, role).can_view:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    occ_count = db.scalar(
        select(func.count(Occurrence.occurrenceId)).where(
            Occurrence.collectionId == col.collectionId
        )
    )
    return _collection_out(current_user, col, role, occ_count)


def _build_collections_page(
    db: Session,
    current_user: User,
    ids_q,
    limit: int,
    offset: int,
) -> Page[CollectionOut]:
    """
    Dado un IDs query (select(Collection.collectionId) ...), pagina y construye
    el Page[CollectionOut] resolviendo el rol del current_user en cada colección.
    """
    total = _paginate_total(db, ids_q)
    ids_subq = ids_q.subquery()

    occ_counts = (
        select(
            Occurrence.collectionId.label("collection_id"),
            func.count(Occurrence.occurrenceId).label("occ_count"),
        )
        .group_by(Occurrence.collectionId)
        .subquery()
    )

    cp_role_sq = (
        select(
            CollectionPermission.collectionId.label("cid"),
            func.max(CollectionPermission.role).label("role"),
        )
        .where(CollectionPermission.userId == current_user.userId)
        .group_by(CollectionPermission.collectionId)
        .subquery()
    )

    q = (
        select(Collection, cp_role_sq.c.role, occ_counts.c.occ_count)
        .join(ids_subq, ids_subq.c.collectionId == Collection.collectionId)
        .join(occ_counts, occ_counts.c.collection_id == Collection.collectionId, isouter=True)
        .join(cp_role_sq, cp_role_sq.c.cid == Collection.collectionId, isouter=True)
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
        items.append(_collection_out(current_user, col, role, occ_count))

    return Page[CollectionOut].of(items, total=total, limit=limit, offset=offset)


def get_collections(
    db: Session,
    access: CollectionAccess,
    limit: int,
    offset: int,
    current_user: User,
) -> Page[CollectionOut]:
    limit, offset = _bounds(limit, offset)

    if access == CollectionAccess.OWNER:
        ids_q = select(Collection.collectionId).where(
            Collection.creatorUserId == current_user.userId
        )
    else:  # CollectionAccess.ALLOWED
        if current_user.isSuperuser:
            ids_q = select(Collection.collectionId)
        elif current_user.isInstitutionAdmin and current_user.institutionId is not None:
            own_inst_q = select(Collection.collectionId).where(
                Collection.institutionId == current_user.institutionId
            )
            cross_inst_q = (
                select(Collection.collectionId)
                .join(
                    CollectionPermission,
                    CollectionPermission.collectionId == Collection.collectionId,
                )
                .where(
                    CollectionPermission.userId == current_user.userId,
                    Collection.institutionId != current_user.institutionId,
                )
                .group_by(Collection.collectionId)
            )
            ids_q = own_inst_q.union(cross_inst_q)
        else:
            ids_q = (
                select(Collection.collectionId)
                .join(
                    CollectionPermission,
                    CollectionPermission.collectionId == Collection.collectionId,
                )
                .where(CollectionPermission.userId == current_user.userId)
                .group_by(Collection.collectionId)
            )

    return _build_collections_page(db, current_user, ids_q, limit, offset)


def create_collection(db: Session, payload: CollectionCreate, current_user: User) -> CollectionOut:
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
        collectionName=payload.collectionName,
        description=payload.description,
        institutionId=institution_id,
        creatorUserId=current_user.userId,
    )
    db.add(col)
    db.flush()  # para obtener col.collectionId

    # Conceder permiso 'owner' al creador (usuario actual)
    db.add(
        CollectionPermission(
            collectionId=col.collectionId,
            userId=current_user.userId,
            role=CollectionRole.OWNER,
            grantedByUserId=current_user.userId,
        )
    )

    db.commit()

    # Recargar con relaciones
    col = db.execute(
        select(Collection)
        .where(Collection.collectionId == col.collectionId)
        .options(
            selectinload(Collection.institution),
            selectinload(Collection.creator),
        )
    ).scalar_one()

    # Recién creada: sin ocurrencias, y quien la crea es 'owner'
    out = _collection_out(current_user, col, CollectionRole.OWNER, 0)
    out.myRole = EffectiveRole.OWNER
    return out


def list_collection_access_users(
    db: Session,
    collection_id: UUID,
    q: Optional[str],
    role: Optional[CollectionRole],
    limit: int,
    offset: int,
    current_user: User,
) -> Page[CollectionAccessUser]:
    # 1) Validar colección
    collection = db.execute(
        select(Collection).where(Collection.collectionId == collection_id)
    ).scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Colección no encontrada")

    # 2) Autorización
    if not user_can_view_collection(db, current_user, collection):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver accesos de esta colección",
        )

    name_expr = func.coalesce(User.fullName, User.username)

    role_order = case(
        (CollectionPermission.role == CollectionRole.OWNER, 0),
        (CollectionPermission.role == CollectionRole.EDITOR, 1),
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
        select(User.userId)
        .join(CollectionPermission, CollectionPermission.userId == User.userId)
        .outerjoin(Institution, Institution.institutionId == User.institutionId)
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
        .join(CollectionPermission, CollectionPermission.userId == User.userId)
        .outerjoin(Institution, Institution.institutionId == User.institutionId)
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

    return Page[CollectionAccessUser].of(items, total=total, limit=limit, offset=offset)


def list_occurrences_brief_by_collection_id(
    db: Session,
    collection_id: UUID,
    q: Optional[str],
    limit: int,
    offset: int,
    current_user: User,
) -> Page[OccurrenceBriefItem]:
    # 1) Colección
    collection = db.execute(
        select(Collection).where(Collection.collectionId == collection_id)
    ).scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Colección no encontrada")

    # 2) Autorización
    if not user_can_view_collection(db, current_user, collection):
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
        select(Occurrence.occurrenceId)
        .outerjoin(
            Identification,
            and_(
                Identification.occurrenceId == Occurrence.occurrenceId,
                Identification.isCurrent.is_(True),
            ),
        )
        .outerjoin(Taxon, Taxon.taxonId == Identification.taxonId)
        .where(*filters)
        .subquery()
    )
    total = db.execute(select(func.count()).select_from(total_subq)).scalar_one()

    # 5) Items paginados
    items_stmt = (
        select(
            Occurrence.occurrenceId.label("occurrence_id"),
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
                Identification.occurrenceId == Occurrence.occurrenceId,
                Identification.isCurrent.is_(True),
            ),
        )
        .outerjoin(Taxon, Taxon.taxonId == Identification.taxonId)
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
            occurrenceId=r.occurrence_id,
            code=r.code,
            scientificName=r.scientific_name,
            family=r.family,
            location=r.location,
            collector=r.collector,
            date=r.date,
        )
        for r in rows
    ]

    return Page[OccurrenceBriefItem].of(items, total=total, limit=limit, offset=offset)


def add_user_to_collection(
    db: Session,
    collection_id: UUID,
    payload: AddUserToCollectionBody,
    current_user: User,
) -> CollectionPermissionOut:
    # 1) Colección
    collection = db.execute(
        select(Collection).where(Collection.collectionId == collection_id)
    ).scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Colección no encontrada")

    # 2) Autorización (SOLO superuser, admin de su institución o owner)
    if not user_can_manage_collection_permissions(db, current_user, collection):
        if current_user.isInstitutionAdmin:
            # Denegado siendo institution admin => la colección es de otra institución
            # (ver docstring de user_can_manage_collection_permissions: aquí no hay
            # fallback a un permiso explícito cuando la institución no coincide).
            raise HTTPException(
                status_code=403,
                detail="No puedes gestionar permisos de una colección de otra institución",
            )
        raise HTTPException(
            status_code=403,
            detail="Se requiere rol 'owner' en la colección para agregar usuarios",
        )

    # 3) Usuario objetivo por email (case-insensitive)
    target = db.execute(select(User).where(User.email.ilike(payload.email))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario (email) no encontrado")
    if not target.isActive:
        raise HTTPException(status_code=400, detail="Usuario inactivo: no puede ser agregado")

    # 4) Insertar permiso con rol viewer/editor (409 si ya existe cualquier rol)
    perm = CollectionPermission(
        collectionId=collection_id,
        userId=target.userId,
        role=payload.role,
        grantedByUserId=current_user.userId,
    )
    try:
        db.add(perm)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing_role = db.execute(
            select(CollectionPermission.role).where(
                CollectionPermission.collectionId == collection_id,
                CollectionPermission.userId == target.userId,
            )
        ).scalar_one_or_none()
        if existing_role:
            raise HTTPException(
                status_code=409,
                detail=(f"El usuario ya tiene acceso a esta colección con rol '{existing_role}'"),
            )
        raise

    return CollectionPermissionOut(
        collectionId=collection_id,
        userId=target.userId,
        email=target.email,
        role=payload.role,
    )
