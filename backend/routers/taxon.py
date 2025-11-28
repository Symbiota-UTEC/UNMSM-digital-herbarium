# backend/api/endpoints/taxon.py
from __future__ import annotations

import math
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.config.database import get_db
from backend.models.models import Taxon, Identification
from backend.schemas.common.pages import Page
from backend.schemas.taxon import TaxonTreeNode, TaxonSynonym, TaxonDetailOut

router = APIRouter(prefix="/taxon", tags=["Taxon"])


@router.get(
    "/tree",
    response_model=Page[TaxonTreeNode],
    summary="Devuelve nodos del árbol taxonómico (hijas de un taxón padre).",
)
def get_taxon_tree(
    parent_id: Optional[str] = Query(
        default=None,
        description=(
            "taxonID del padre. Si se omite, devuelve los taxones raíz "
            "(aquellos con taxonRank = 'kingdom')."
        ),
    ),
    only_current: bool = Query(
        default=True,
        description="Si es True, filtra solo Taxon.isCurrent = true.",
    ),
    major_group: Optional[str] = Query(
        default=None,
        description="Filtra por majorGroup (opcional). Útil para separar plantas, algas, etc.",
    ),
    page: int = Query(1, ge=1),
    size: int = Query(50),
    db: Session = Depends(get_db),
):
    """
    Devuelve una página de nodos del árbol taxonómico.

    - Si `parent_id` es None: devuelve las raíces del árbol
      (taxonRank = 'kingdom' o 'Kingdom').
    - Si `parent_id` tiene valor: devuelve los taxones con
      parentNameUsageID = parent_id (hijas).
    - `hasChildren` indica si el nodo tiene hijas.
    - `synonyms` incluye sinónimos cuyo acceptedNameUsageID apunta a este taxón.
    """

    # ------------------------ Query base con filtros ------------------------

    # Filtros comunes (isCurrent, major_group)
    filters = []
    if only_current:
        filters.append(Taxon.isCurrent.is_(True))
    if major_group:
        filters.append(Taxon.majorGroup == major_group)

    if parent_id:
        # Hijas de un taxón específico
        filters.append(Taxon.parentNameUsageID == parent_id)
    else:
        # Raíces del árbol: reinos
        filters.append(Taxon.taxonRank.in_(["kingdom", "Kingdom"]))

    base_query = select(Taxon).where(*filters)

    # ----------------------------- Paginación ------------------------------

    total: int = db.scalar(
        select(func.count()).select_from(base_query.subquery())
    ) or 0

    limit = size
    offset = (page - 1) * limit
    total_pages = math.ceil(total / limit) if total > 0 else 0
    remaining_pages = max(total_pages - page, 0)

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
        return Page[TaxonTreeNode](
            items=[],
            total=total,
            limit=limit,
            offset=offset,
            currentPage=page,
            totalPages=total_pages,
            remainingPages=remaining_pages,
        )

    # ------------------------- Calcular hasChildren ------------------------

    parent_ids = [t.taxonID for t in taxa if t.taxonID]

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
            Taxon.acceptedNameUsageID != Taxon.taxonID,  # excluir el aceptado en sí
        ]
        if only_current:
            syn_filters.append(Taxon.isCurrent.is_(True))

        synonyms = db.scalars(select(Taxon).where(*syn_filters)).all()

        for syn in synonyms:
            accepted_id = syn.acceptedNameUsageID
            if accepted_id in synonyms_map:
                synonyms_map[accepted_id].append(
                    TaxonSynonym(
                        id=syn.id,
                        taxonID=syn.taxonID,
                        scientificName=syn.scientificName,
                        scientificNameAuthorship=syn.scientificNameAuthorship,
                        taxonomicStatus=syn.taxonomicStatus,
                    )
                )

    # --------------------------- Construir nodos ---------------------------

    items: List[TaxonTreeNode] = []
    for t in taxa:
        tid = t.taxonID
        full_name = (
            f"{t.scientificName} {t.scientificNameAuthorship}".strip()
            if t.scientificName
            else None
        )

        items.append(
            TaxonTreeNode(
                id=t.id,
                taxonID=tid,
                scientificName=t.scientificName,
                scientificNameAuthorship=t.scientificNameAuthorship,
                fullName=full_name,
                taxonRank=t.taxonRank,
                parentNameUsageID=t.parentNameUsageID,
                acceptedNameUsageID=t.acceptedNameUsageID,
                taxonomicStatus=t.taxonomicStatus,
                isCurrent=t.isCurrent,
                hasChildren=bool(tid and children_counts.get(tid, 0) > 0),
                synonyms=synonyms_map.get(tid, []),
            )
        )

    # ---------------------- Respuesta paginada final ----------------------

    return Page[TaxonTreeNode](
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        currentPage=page,
        totalPages=total_pages,
        remainingPages=remaining_pages,
    )


@router.get(
    "/{taxon_id}",
    response_model=TaxonDetailOut,
    summary="Devuelve un taxón del backbone y todas sus identificaciones asociadas.",
)
def get_taxon_detail(
    taxon_id: str,
    db: Session = Depends(get_db),
):
    if not taxon_id or taxon_id == "undefined":
        raise HTTPException(status_code=400, detail="taxon_id inválido")

    taxon: Optional[Taxon] = db.scalar(
        select(Taxon)
        .options(
            selectinload(Taxon.identifications)
            .selectinload(Identification.identifiers)
        )
        .where(Taxon.taxonID == taxon_id)
    )

    if taxon is None:
        raise HTTPException(status_code=404, detail="Taxón no encontrado")

    return taxon
