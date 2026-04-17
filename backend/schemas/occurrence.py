from __future__ import annotations
from uuid import UUID
# backend/schemas/occurrence.py

from datetime import datetime, date
from typing import Any, Dict, List, Optional

from backend.schemas.common.base import ORMBaseModel, StrictBaseModel
from pydantic import BaseModel, Field

# -----------------------------
# Resumenes / submodelos
# -----------------------------


class OccurrenceCollectionSummaryOut(ORMBaseModel):
    collectionId: UUID
    collectionName: Optional[str] = None
    institutionId: Optional[UUID] = None


class OccurrenceIdentifierOut(ORMBaseModel):
    identifierId: UUID
    fullName: Optional[str] = None
    orcID: Optional[str] = None


class OccurrenceTaxonOut(ORMBaseModel):
    taxonId: UUID
    scientificName: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None
    family: Optional[str] = None
    genus: Optional[str] = None
    specificEpithet: Optional[str] = None
    infraspecificEpithet: Optional[str] = None
    taxonRank: Optional[str] = None


class OccurrenceIdentificationOut(ORMBaseModel):
    identificationId: UUID
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
    occurrenceImageId: UUID
    occurrenceId: UUID

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
    occurrenceId: UUID

    # Enlaces
    collectionId: Optional[UUID] = None
    collection: Optional[OccurrenceCollectionSummaryOut] = None
    digitizerUserId: Optional[UUID] = None

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
    verbatimElevation: Optional[str] = None

    countryCode: Optional[str] = None
    hydrographicContext: Optional[str] = None
    footprintWKT: Optional[str] = None

    organismQuantity: Optional[str] = None
    organismQuantityType: Optional[str] = None
    georeferenceVerificationStatus: Optional[str] = None

    habitat: Optional[str] = None
    eventRemarks: Optional[str] = None
    occurrenceStatus: Optional[str] = None
    occurrenceRemarks: Optional[str] = None
    lifeStage: Optional[str] = None
    establishmentMeans: Optional[str] = None
    associatedReferences: Optional[str] = None
    associatedTaxa: Optional[str] = None

    dynamicProperties: Optional[Dict[str, Any]] = None

    fieldNotes: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime

    # Relacionados
    identifications: List[OccurrenceIdentificationOut] = []

    # Nueva relación: identificación vigente
    currentIdentificationId: Optional[UUID] = None
    currentIdentification: Optional[OccurrenceIdentificationOut] = None

    # Nuevas imágenes asociadas
    images: List[OccurrenceImageOut] = []


# -----------------------------
# Vista breve para listados
# -----------------------------


class OccurrenceBriefItem(ORMBaseModel):
    occurrenceId: UUID
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

class IdentifierIn(StrictBaseModel):
    name: str
    orcid: Optional[str] = None


class OccurrenceCreateIn(StrictBaseModel):
    collectionId: UUID

    occurrenceID: Optional[str] = None
    catalogNumber: str
    recordNumber: Optional[str] = None
    recordedBy: Optional[str] = None
    
    # Event
    eventDate: Optional[str] = None
    verbatimEventDate: Optional[str] = None
    year: Optional[int] = None
    month: Optional[int] = None
    day: Optional[int] = None
    habitat: Optional[str] = None
    eventRemarks: Optional[str] = None

    # Location
    country: Optional[str] = None
    stateProvince: Optional[str] = None
    county: Optional[str] = None
    municipality: Optional[str] = None
    locality: Optional[str] = None
    verbatimLocality: Optional[str] = None
    decimalLatitude: Optional[float] = None
    decimalLongitude: Optional[float] = None
    verbatimElevation: Optional[str] = None
    hydrographicContext: Optional[str] = None

    # Extra mapped directly (if exist in models)
    organismQuantity: Optional[str] = None
    organismQuantityType: Optional[str] = None
    occurrenceStatus: Optional[str] = None
    lifeStage: Optional[str] = None
    establishmentMeans: Optional[str] = None
    associatedReferences: Optional[str] = None
    associatedTaxa: Optional[str] = None
    occurrenceRemarks: Optional[str] = None
    fieldNotes: Optional[str] = None
    georeferenceVerificationStatus: Optional[str] = None
    locationRemarks: Optional[str] = None
    countryCode: Optional[str] = None

    # Taxon / Identification
    taxonId: Optional[UUID] = None
    scientificName: Optional[str] = None
    dateIdentified: Optional[str] = None
    typeStatus: Optional[str] = None
    isVerified: Optional[bool] = None
    identifiers: Optional[List[IdentifierIn]] = None

    # Dynamic properties dictionary mapped by frontend
    dynamicProperties: Optional[Dict[str, Any]] = None



class OccurrenceUpdateIn(StrictBaseModel):
    catalogNumber: Optional[str] = None
    recordNumber: Optional[str] = None
    recordedBy: Optional[str] = None

    # Event
    eventDate: Optional[str] = None
    verbatimEventDate: Optional[str] = None
    year: Optional[int] = None
    month: Optional[int] = None
    day: Optional[int] = None
    habitat: Optional[str] = None
    eventRemarks: Optional[str] = None

    # Location
    country: Optional[str] = None
    stateProvince: Optional[str] = None
    county: Optional[str] = None
    municipality: Optional[str] = None
    locality: Optional[str] = None
    verbatimLocality: Optional[str] = None
    decimalLatitude: Optional[float] = None
    decimalLongitude: Optional[float] = None
    verbatimElevation: Optional[str] = None
    hydrographicContext: Optional[str] = None

    # Occurrence extra
    organismQuantity: Optional[str] = None
    organismQuantityType: Optional[str] = None
    occurrenceStatus: Optional[str] = None
    lifeStage: Optional[str] = None
    establishmentMeans: Optional[str] = None
    associatedReferences: Optional[str] = None
    associatedTaxa: Optional[str] = None
    occurrenceRemarks: Optional[str] = None
    fieldNotes: Optional[str] = None
    georeferenceVerificationStatus: Optional[str] = None
    locationRemarks: Optional[str] = None
    countryCode: Optional[str] = None

    dynamicProperties: Optional[Dict[str, Any]] = None

    # Identificación vigente — si se envía alguno se actualiza la identificación actual
    taxonId: Optional[UUID] = None
    scientificName: Optional[str] = None
    dateIdentified: Optional[str] = None
    typeStatus: Optional[str] = None
    isVerified: Optional[bool] = None
    identifiers: Optional[List[IdentifierIn]] = None


class IdentificationCreateIn(StrictBaseModel):
    taxonId: Optional[UUID] = None
    scientificName: Optional[str] = None
    dateIdentified: Optional[str] = None
    typeStatus: Optional[str] = None
    isVerified: Optional[bool] = None
    identifiers: Optional[List[IdentifierIn]] = None
    setAsCurrent: Optional[bool] = False


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

    collection_id: Optional[UUID] = None
    institution_id: Optional[UUID] = None
