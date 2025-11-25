from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class TaxonSynonym(BaseModel):
    """Sinónimo de un taxón aceptado (solo datos mínimos para mostrar en el árbol)."""

    id: int
    taxonID: Optional[str] = None
    scientificName: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None
    taxonomicStatus: Optional[str] = None

    class Config:
        from_attributes = True


class TaxonTreeNode(BaseModel):
    """
    Nodo del árbol taxonómico para visualización.

    children no se incluye para evitar respuestas gigantes; el front
    vuelve a llamar al endpoint usando taxonID como parent_id.
    """

    id: int
    taxonID: Optional[str] = None
    scientificName: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None
    fullName: Optional[str] = Field(
        None,
        description="Nombre completo ya formateado: scientificName + autoría.",
    )
    taxonRank: Optional[str] = None
    parentNameUsageID: Optional[str] = None
    acceptedNameUsageID: Optional[str] = None
    taxonomicStatus: Optional[str] = None
    isCurrent: bool
    hasChildren: bool = Field(
        False, description="True si existen taxones con parentNameUsageID = este taxonID."
    )
    synonyms: List[TaxonSynonym] = Field(
        default_factory=list,
        description="Sinónimos cuyo acceptedNameUsageID apunta a este taxon.",
    )

    class Config:
        from_attributes = True
