# backend/schemas/occurrence.py
from __future__ import annotations

from datetime import datetime, date
from typing import Any, Dict, List, Optional

from backend.schemas.common.base import ORMBaseModel, StrictBaseModel
from pydantic import BaseModel, Field

# -----------------------------
# Resumenes / submodelos
# -----------------------------


class OccurrenceCollectionSummaryOut(ORMBaseModel):
    id: int
    collectionCode: Optional[str] = None
    collectionName: Optional[str] = None
    institutionId: Optional[int] = None


class OccurrenceAgentOut(ORMBaseModel):
    id: int
    fullName: Optional[str] = None
    orcID: Optional[str] = None


class OccurrenceIdentifierOut(ORMBaseModel):
    id: int
    fullName: Optional[str] = None
    orcID: Optional[str] = None


class OccurrenceTaxonOut(ORMBaseModel):
    id: int
    scientificName: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None
    family: Optional[str] = None
    genus: Optional[str] = None
    specificEpithet: Optional[str] = None
    infraspecificEpithet: Optional[str] = None
    taxonRank: Optional[str] = None
    taxonID: Optional[str] = None


class OccurrenceIdentificationOut(ORMBaseModel):
    id: int
    identifiedBy: Optional[str] = None
    dateIdentified: Optional[str] = None
    isCurrent: bool
    isVerified: bool
    typeStatus: Optional[str] = None

    taxon: Optional[OccurrenceTaxonOut] = None
    identifiers: List[OccurrenceIdentifierOut] = []

    createdAt: datetime
    updatedAt: datetime

    scientificName: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None


class OccurrenceImageOut(ORMBaseModel):
    """
    Imagen asociada a una ocurrencia (refleja el modelo OccurrenceImage).
    """
    id: int
    occurrenceId: int

    imagePath: str
    fileSize: Optional[int] = None
    photographer: Optional[str] = None

    createdAt: datetime
    updatedAt: datetime


# -----------------------------
# Detalle de ocurrencia
# -----------------------------


class OccurrenceOut(ORMBaseModel):
    # Identificador
    id: int

    # Enlaces
    collectionId: Optional[int] = None
    collection: Optional[OccurrenceCollectionSummaryOut] = None
    digitizerUserId: Optional[int] = None

    # Occurrence + Event + Location (aplanado)
    recordNumber: Optional[str] = None
    recordedBy: Optional[str] = None
    catalogNumber: Optional[str] = None

    verbatimEventDate: Optional[str] = None
    eventDate: Optional[str] = None
    year: Optional[int] = None
    month: Optional[int] = None
    day: Optional[int] = None

    country: Optional[str] = None
    stateProvince: Optional[str] = None
    county: Optional[str] = None
    municipality: Optional[str] = None
    locality: Optional[str] = None
    verbatimLocality: Optional[str] = None
    locationRemarks: Optional[str] = None

    decimalLatitude: Optional[float] = None
    decimalLongitude: Optional[float] = None
    georeferencedBy: Optional[str] = None
    georeferenceRemarks: Optional[str] = None
    verbatimElevation: Optional[str] = None
    minimumElevationInMeters: Optional[float] = None
    maximumElevationInMeters: Optional[float] = None

    countryCode: Optional[str] = None
    verbatimCoordinateSystem: Optional[str] = None
    hydrographicContext: Optional[str] = None
    footprintWKT: Optional[str] = None

    organismQuantity: Optional[str] = None
    organismQuantityType: Optional[str] = None
    georeferenceVerificationStatus: Optional[str] = None
    otherCatalogNumbers: Optional[str] = None

    habitat: Optional[str] = None
    eventRemarks: Optional[str] = None
    occurrenceRemarks: Optional[str] = None
    lifeStage: Optional[str] = None
    establishmentMeans: Optional[str] = None
    associatedReferences: Optional[str] = None
    associatedTaxa: Optional[str] = None

    dynamicProperties: Optional[Dict[str, Any]] = None

    projectTitle: Optional[str] = None
    sampleSizeValue: Optional[float] = None
    sampleSizeUnit: Optional[str] = None
    fieldNotes: Optional[str] = None
    projectID: Optional[str] = None
    fundingAttribution: Optional[str] = None
    fundingAttributionID: Optional[str] = None

    createdAt: datetime
    updatedAt: datetime

    # Relacionados
    agents: List[OccurrenceAgentOut] = []
    identifications: List[OccurrenceIdentificationOut] = []

    # Nueva relación: identificación vigente
    currentIdentificationId: Optional[int] = None
    currentIdentification: Optional[OccurrenceIdentificationOut] = None

    # Nuevas imágenes asociadas
    images: List[OccurrenceImageOut] = []


# -----------------------------
# Vista breve para listados
# -----------------------------


class OccurrenceBriefItem(ORMBaseModel):
    id: int
    code: Optional[str] = None
    scientificName: Optional[str] = None
    family: Optional[str] = None
    location: Optional[str] = None
    collector: Optional[str] = None
    # eventDate en Occurrence es String (ISO8601 / etiqueta)
    date: Optional[str] = None
    institutionName: Optional[str] = None


# -----------------------------
# Inputs
# -----------------------------


class DynamicPropsIn(StrictBaseModel):
    dynamicProperties: Optional[Dict[str, Any] | str] = None


class OccurrenceFilters(BaseModel):
    code: Optional[str] = None
    scientific_name: Optional[str] = None
    family: Optional[str] = None
    institution: Optional[str] = None
    location: Optional[str] = None
    collector: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None

    collection_id: Optional[int] = None
    institution_id: Optional[int] = None
