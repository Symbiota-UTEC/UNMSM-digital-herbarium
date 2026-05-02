from __future__ import annotations
from uuid import UUID
# backend/schemas/taxon.py

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class TaxonSynonym(BaseModel):
    """Sinónimo de un taxón aceptado (solo datos mínimos para mostrar en el árbol)."""

    taxonId: UUID
    wfoTaxonId: Optional[str] = None
    scientificName: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None
    taxonomicStatus: Optional[str] = None

    class Config:
        from_attributes = True


class TaxonTreeNode(BaseModel):
    """
    Nodo del árbol taxonómico para visualización.

    children no se incluye para evitar respuestas gigantes; el front
    vuelve a llamar al endpoint usando taxonId como parent_id.
    """

    taxonId: UUID
    wfoTaxonId: Optional[str] = Field(
        None,
        description="ID externo del backbone WFO. Usar como parent_id para navegar el árbol.",
    )
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
        False, description="True si existen taxones con parentNameUsageID = este wfoTaxonId."
    )
    synonyms: List[TaxonSynonym] = Field(
        default_factory=list,
        description="Sinónimos cuyo acceptedNameUsageID apunta a este taxon.",
    )

    class Config:
        from_attributes = True


class TaxonSearchItem(BaseModel):
    """Resultado ligero de búsqueda para navegación rápida en /taxon."""

    taxonId: UUID
    wfoTaxonId: Optional[str] = None
    scientificName: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None
    taxonRank: Optional[str] = None
    taxonomicStatus: Optional[str] = None
    family: Optional[str] = None
    isCurrent: bool
    occurrenceCount: int = 0

    class Config:
        from_attributes = True


# -------------------------------------------------
# Schemas para detalle de Taxon + identificaciones
# -------------------------------------------------


class TaxonIdentifierOut(BaseModel):
    """Persona que intervino en una identificación de este taxón."""

    identifierId: UUID
    fullName: Optional[str] = None
    orcID: Optional[str] = None

    class Config:
        from_attributes = True


class TaxonIdentificationOut(BaseModel):
    """Identificación taxonómica que usa este taxón."""

    taxonId: UUID
    occurrenceId: UUID

    dateIdentified: Optional[str] = None
    isCurrent: bool
    isVerified: bool
    typeStatus: Optional[str] = None

    scientificName: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None

    createdAt: datetime
    updatedAt: datetime

    identifiers: List[TaxonIdentifierOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class TaxonDetailOut(BaseModel):
    """
    Detalle completo de un taxón del backbone + todas
    las identificaciones que lo usan.
    """

    taxonId: UUID
    scientificNameID: Optional[str] = None
    localID: Optional[str] = None
    scientificName: Optional[str] = None
    taxonRank: Optional[str] = None
    parentNameUsageID: Optional[str] = None

    scientificNameAuthorship: Optional[str] = None
    family: Optional[str] = None
    subfamily: Optional[str] = None
    tribe: Optional[str] = None
    subtribe: Optional[str] = None
    genus: Optional[str] = None
    subgenus: Optional[str] = None
    specificEpithet: Optional[str] = None
    infraspecificEpithet: Optional[str] = None
    verbatimTaxonRank: Optional[str] = None
    nomenclaturalStatus: Optional[str] = None

    namePublishedIn: Optional[str] = None
    taxonomicStatus: Optional[str] = None
    acceptedNameUsageID: Optional[str] = None
    originalNameUsageID: Optional[str] = None
    nameAccordingToID: Optional[str] = None
    taxonRemarks: Optional[str] = None

    created: Optional[date] = None
    modified: Optional[date] = None

    references: Optional[str] = None
    source: Optional[str] = None
    majorGroup: Optional[str] = None
    tplID: Optional[str] = None

    isCurrent: bool

    # Todas las identificaciones que usan este taxón
    identifications: List[TaxonIdentificationOut] = Field(default_factory=list)

    class Config:
        from_attributes = True
