# backend/services/autocomplete.py
from sqlalchemy import select, func, exists, or_
from sqlalchemy.orm import Session

from backend.models.models import Taxon, Institution, Occurrence, User, Collection, CollectionPermission
from backend.schemas.autocomplete import ScientificNameSuggestion


def suggest_scientific_names(db: Session, q: str, limit: int) -> list[ScientificNameSuggestion]:
    term = q.strip()
    if not term:
        return []

    pattern = f"{term.lower()}%"  # prefijo

    stmt = (
        select(Taxon.scientificName, Taxon.taxonId, Taxon.wfoTaxonId, Taxon.scientificNameAuthorship)
        .where(
            func.unaccent_immutable(
                func.lower(Taxon.scientificName)
            ).like(func.unaccent_immutable(pattern))
        )
        .distinct(Taxon.scientificName, Taxon.taxonId, Taxon.wfoTaxonId, Taxon.scientificNameAuthorship)
        .order_by(Taxon.scientificName)
        .limit(limit)
    )
    rows = db.execute(stmt).all()
    return [
        ScientificNameSuggestion(
            scientificName=row[0],
            taxonId=row[1],
            wfoTaxonId=row[2],
            scientificNameAuthorship=row[3],
        )
        for row in rows
        if row[0]
    ]


def suggest_families(db: Session, q: str, limit: int) -> list[str]:
    term = q.strip()
    if not term:
        return []

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
    return [row[0] for row in db.execute(stmt) if row[0]]


def suggest_institutions(db: Session, q: str, limit: int) -> list[str]:
    term = q.strip()
    if not term:
        return []

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
    return [row[0] for row in db.execute(stmt) if row[0]]


def suggest_locations(db: Session, q: str, limit: int, current_user: User) -> list[str]:
    term = q.strip()
    if not term:
        return []

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
    stmt = stmt.join(Collection, Occurrence.collectionId == Collection.collectionId, isouter=True)

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
        access_conditions.append(Collection.creatorUserId == current_user.userId)

        # 2) Colecciones donde el usuario tiene permiso explícito
        access_conditions.append(
            exists()
            .where(CollectionPermission.collectionId == Occurrence.collectionId)
            .where(CollectionPermission.userId == current_user.userId)
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

    return [row[0] for row in db.execute(stmt) if row[0]]


def suggest_collectors(db: Session, q: str, limit: int) -> list[str]:
    term = q.strip()
    if not term:
        return []

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
    return [row[0] for row in db.execute(stmt) if row[0]]
