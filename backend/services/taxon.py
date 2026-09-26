# backend/services/taxon.py
from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.models.models import Collection, Identification, Institution, Occurrence, Taxon, User
from backend.schemas.common.pages import Page
from backend.schemas.taxon import (
    TaxonIdentificationOrder,
    TaxonIdentificationOut,
    TaxonIdentificationSort,
    TaxonSearchItem,
    TaxonSearchOrder,
    TaxonSearchSort,
    TaxonSynonym,
    TaxonTreeNode,
)
from backend.services.collection_permissions import visible_occurrences_condition


def _unaccent_lower(expr):
    return func.unaccent_immutable(func.lower(expr))


def get_taxon_tree(
    db: Session,
    parent_id: Optional[str],
    only_current: bool,
    major_group: Optional[str],
    page: int,
    size: int,
) -> Page[TaxonTreeNode]:
    # ------------------------ Query base con filtros ------------------------

    filters = []
    if only_current:
        filters.append(Taxon.isCurrent.is_(True))
    if major_group:
        filters.append(Taxon.majorGroup == major_group)

    if parent_id:
        filters.append(Taxon.parentNameUsageID == parent_id)
    else:
        # Raíces del árbol: reinos
        filters.append(Taxon.taxonRank.in_(["kingdom", "Kingdom"]))

    base_query = select(Taxon).where(*filters)

    # ----------------------------- Paginación ------------------------------

    total: int = db.scalar(select(func.count()).select_from(base_query.subquery())) or 0

    limit = size
    offset = (page - 1) * limit

    taxa: List[Taxon] = (
        db.scalars(
            base_query.order_by(
                Taxon.majorGroup.nulls_last(),
                Taxon.scientificName.nulls_last(),
            )
            .offset(offset)
            .limit(limit)
        )
        .unique()
        .all()
    )

    if not taxa:
        # Página vacía, pero con estructura completa de Page
        return Page[TaxonTreeNode].of([], total=total, limit=limit, offset=offset)

    # ------------------------- Calcular hasChildren ------------------------

    parent_ids = [str(t.wfoTaxonId) for t in taxa if t.wfoTaxonId]

    children_counts: dict[str, int] = {}
    if parent_ids:
        children_filters = [Taxon.parentNameUsageID.in_(parent_ids)]
        if only_current:
            children_filters.append(Taxon.isCurrent.is_(True))

        rows = db.execute(
            select(Taxon.parentNameUsageID, func.count())
            .where(*children_filters)
            .group_by(Taxon.parentNameUsageID)
        ).all()
        children_counts = dict(rows)

    # ------------------------ Cargar sinónimos por padre -------------------

    synonyms_map: dict[str, list[TaxonSynonym]] = {tid: [] for tid in parent_ids}

    if parent_ids:
        syn_filters = [
            Taxon.acceptedNameUsageID.in_(parent_ids),
            Taxon.acceptedNameUsageID != Taxon.wfoTaxonId,  # excluir el aceptado en sí
        ]
        if only_current:
            syn_filters.append(Taxon.isCurrent.is_(True))

        synonyms = db.scalars(select(Taxon).where(*syn_filters)).all()

        for syn in synonyms:
            accepted_id = syn.acceptedNameUsageID
            if accepted_id in synonyms_map:
                synonyms_map[accepted_id].append(
                    TaxonSynonym(
                        id=syn.taxonId,
                        taxonId=syn.taxonId,
                        scientificName=syn.scientificName,
                        scientificNameAuthorship=syn.scientificNameAuthorship,
                        taxonomicStatus=syn.taxonomicStatus,
                    )
                )

    # --------------------------- Construir nodos ---------------------------

    items: List[TaxonTreeNode] = []
    for t in taxa:
        wid = t.wfoTaxonId  # used for tree lookups (children, synonyms)
        full_name = (
            f"{t.scientificName} {t.scientificNameAuthorship}".strip() if t.scientificName else None
        )

        items.append(
            TaxonTreeNode(
                id=t.taxonId,
                taxonId=t.taxonId,
                wfoTaxonId=wid,
                scientificName=t.scientificName,
                scientificNameAuthorship=t.scientificNameAuthorship,
                fullName=full_name,
                taxonRank=t.taxonRank,
                parentNameUsageID=t.parentNameUsageID,
                acceptedNameUsageID=t.acceptedNameUsageID,
                taxonomicStatus=t.taxonomicStatus,
                isCurrent=t.isCurrent,
                hasChildren=bool(wid and children_counts.get(wid, 0) > 0),
                synonyms=synonyms_map.get(wid, []),
            )
        )

    # ---------------------- Respuesta paginada final ----------------------

    return Page[TaxonTreeNode].of(items, total=total, limit=limit, offset=offset)


def _taxon_search_order_by(
    sort: Optional[TaxonSearchSort],
    order: Optional[TaxonSearchOrder],
    occurrence_count_col,
):
    """Un solo criterio a la vez (ver TaxonSearchSort). Sin sort, alfabético por
    scientificName (con scientificNameAuthorship y taxonId como desempate estable)."""
    if sort is None:
        return [
            Taxon.scientificName.nulls_last(),
            Taxon.scientificNameAuthorship.nulls_last(),
            Taxon.taxonId,
        ]

    default_order = "desc" if sort == "occurrenceCount" else "asc"
    asc = (order or default_order) == "asc"

    if sort == "occurrenceCount":
        column = occurrence_count_col
    else:
        column = _unaccent_lower(
            {"scientificName": Taxon.scientificName, "family": Taxon.family}[sort]
        )

    direction = column.asc().nulls_last() if asc else column.desc().nulls_last()
    return [direction, Taxon.taxonId]


def search_taxa(
    db: Session,
    q: str,
    only_current: bool,
    page: int,
    size: int,
    sort: Optional[TaxonSearchSort] = None,
    order: Optional[TaxonSearchOrder] = None,
) -> Page[TaxonSearchItem]:
    term = q.strip()
    limit = size
    offset = (page - 1) * limit

    if not term:
        return Page[TaxonSearchItem].of([], total=0, limit=limit, offset=offset)

    if order is not None and sort is None:
        raise HTTPException(status_code=400, detail="order requiere sort.")

    pattern = f"%{term.lower()}%"
    filters = [
        Taxon.scientificName.isnot(None),
        func.unaccent_immutable(func.lower(Taxon.scientificName)).like(
            func.unaccent_immutable(pattern)
        ),
    ]
    if only_current:
        filters.append(Taxon.isCurrent.is_(True))

    base_query = select(Taxon.taxonId).where(*filters)

    total: int = db.scalar(select(func.count()).select_from(base_query.subquery())) or 0

    occurrence_count_col = func.count(func.distinct(Identification.occurrenceId)).label(
        "occurrence_count"
    )

    rows = db.execute(
        select(
            Taxon.taxonId,
            Taxon.wfoTaxonId,
            Taxon.scientificName,
            Taxon.scientificNameAuthorship,
            Taxon.taxonRank,
            Taxon.taxonomicStatus,
            Taxon.family,
            Taxon.isCurrent,
            occurrence_count_col,
        )
        .outerjoin(Identification, Identification.taxonId == Taxon.taxonId)
        .where(*filters)
        .group_by(
            Taxon.taxonId,
            Taxon.wfoTaxonId,
            Taxon.scientificName,
            Taxon.scientificNameAuthorship,
            Taxon.taxonRank,
            Taxon.taxonomicStatus,
            Taxon.family,
            Taxon.isCurrent,
        )
        .order_by(*_taxon_search_order_by(sort, order, occurrence_count_col))
        .offset(offset)
        .limit(limit)
    ).all()

    items = [
        TaxonSearchItem(
            taxonId=row.taxonId,
            wfoTaxonId=row.wfoTaxonId,
            scientificName=row.scientificName,
            scientificNameAuthorship=row.scientificNameAuthorship,
            taxonRank=row.taxonRank,
            taxonomicStatus=row.taxonomicStatus,
            family=row.family,
            isCurrent=row.isCurrent,
            occurrenceCount=row.occurrence_count or 0,
        )
        for row in rows
    ]

    return Page[TaxonSearchItem].of(items, total=total, limit=limit, offset=offset)


def get_taxon_detail(db: Session, taxon_id: str) -> Taxon:
    if not taxon_id or taxon_id == "undefined":
        raise HTTPException(status_code=400, detail="taxon_id inválido")

    # Sin las identificaciones: pueden ser N y saturar esta respuesta si N es grande.
    # Se piden aparte, paginadas, con list_taxon_identifications.
    taxon: Optional[Taxon] = db.scalar(select(Taxon).where(Taxon.taxonId == taxon_id))

    if taxon is None:
        raise HTTPException(status_code=404, detail="Taxón no encontrado")

    return taxon


def _taxon_identifications_order_by(
    sort: Optional[TaxonIdentificationSort], order: Optional[TaxonIdentificationOrder]
):
    """Un solo criterio a la vez (ver TaxonIdentificationSort). Sin sort, el orden por
    defecto es vigentes primero y luego las más recientes."""
    if sort is None:
        return [Identification.isCurrent.desc(), Identification.createdAt.desc()]

    default_order = "asc" if sort == "institution" else "desc"
    asc = (order or default_order) == "asc"

    if sort == "institution":
        column = _unaccent_lower(Institution.institutionName)
    else:
        column = {
            "dateIdentified": Identification.dateIdentified,
            "isCurrent": Identification.isCurrent,
        }[sort]
    return [column.asc().nulls_last() if asc else column.desc().nulls_last()]


def list_taxon_identifications(
    db: Session,
    taxon_id: str,
    page: int,
    page_size: int,
    current_user: User,
    sort: Optional[TaxonIdentificationSort] = None,
    order: Optional[TaxonIdentificationOrder] = None,
) -> Page[TaxonIdentificationOut]:
    if not taxon_id or taxon_id == "undefined":
        raise HTTPException(status_code=400, detail="taxon_id inválido")

    if order is not None and sort is None:
        raise HTTPException(status_code=400, detail="order requiere sort.")

    exists = db.scalar(select(Taxon.taxonId).where(Taxon.taxonId == taxon_id))
    if exists is None:
        raise HTTPException(status_code=404, detail="Taxón no encontrado")

    limit = page_size
    offset = (page - 1) * page_size

    # Solo identificaciones de ocurrencias visibles para current_user (misma regla que
    # _visible_occurrences_select en services/occurrences.py): sin esto, cualquier usuario
    # vería identificaciones de colecciones privadas a las que no tiene acceso.
    base_query = (
        select(Identification, Institution.institutionName)
        .join(Occurrence, Identification.occurrenceId == Occurrence.occurrenceId)
        .join(Collection, Occurrence.collectionId == Collection.collectionId)
        .outerjoin(Institution, Collection.institutionId == Institution.institutionId)
        .where(Identification.taxonId == taxon_id)
    )
    visibility = visible_occurrences_condition(current_user)
    if visibility is not None:
        base_query = base_query.where(visibility)

    total = db.scalar(select(func.count()).select_from(base_query.subquery())) or 0

    rows = (
        db.execute(
            base_query.options(selectinload(Identification.identifiers))
            .order_by(*_taxon_identifications_order_by(sort, order))
            .offset(offset)
            .limit(limit)
        )
        .unique()
        .all()
    )

    items = []
    for identification, institution_name in rows:
        item = TaxonIdentificationOut.model_validate(identification, from_attributes=True)
        item.institution = institution_name
        items.append(item)

    return Page[TaxonIdentificationOut].of(items, total=total, limit=limit, offset=offset)
