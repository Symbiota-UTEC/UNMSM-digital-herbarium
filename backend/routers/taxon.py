# backend/routers/taxon.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.schemas.common.pages import Page
from backend.schemas.taxon import TaxonTreeNode, TaxonDetailOut, TaxonSearchItem
from backend.services import taxon as taxon_service

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
            "wfoTaxonId del padre (ej: 'wfo-4100001250'). Si se omite, devuelve los taxones raíz "
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
    size: int = Query(50, ge=1),
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
    return taxon_service.get_taxon_tree(db, parent_id, only_current, major_group, page, size)


@router.get(
    "/search",
    response_model=Page[TaxonSearchItem],
    summary="Busca taxones por nombre científico.",
)
def search_taxa(
    q: str = Query(..., min_length=1, description="Texto a buscar en scientificName."),
    only_current: bool = Query(
        default=True,
        description="Si es True, filtra solo Taxon.isCurrent = true.",
    ),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return taxon_service.search_taxa(db, q, only_current, page, size)


@router.get(
    "/{taxon_id}",
    response_model=TaxonDetailOut,
    summary="Devuelve un taxón del backbone y todas sus identificaciones asociadas.",
)
def get_taxon_detail(
    taxon_id: str,
    db: Session = Depends(get_db),
):
    return taxon_service.get_taxon_detail(db, taxon_id)
