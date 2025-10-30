"""
Modelos SQLAlchemy 2.0 para implementar Darwin Core (DwC) con núcleo Occurrence.

Notas generales:
- Este esquema relacional separa las clases DwC: Occurrence (núcleo), Event, Location,
  GeologicalContext, Taxon, Organism, Identification, MeasurementOrFact, Multimedia,
  ResourceRelationship, Agent, Reference, Collection, Institution.
- Incluye la mayoría de términos estándar de cada clase (DwC Quick Reference Guide),
  priorizando los más usados en colecciones y monitoreo. Los valores DwC suelen ser
  cadenas; se tipifican como String/Text y numéricos cuando corresponde.
- Comentarios por campo explican en español el significado (prefijo dwc: omitido en
  nombres de columna para brevedad).
- Si exportas a DwC-Archive, mapearás columnas a términos DwC en tu capa de exportación
  (e.g., generando los .txt + meta.xml).

Referencias claves (no importadas aquí): DwC Quick Reference Guide.
"""
from __future__ import annotations

from typing import List, Optional, Literal
from sqlalchemy import (
    String,
    Text,
    Integer,
    Float,
    Date,
    DateTime,
    Boolean,
    ForeignKey,
    UniqueConstraint,
    Index,
    Enum,
)
from backend.config.database import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime



class Institution(Base):
    __tablename__ = "institution"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    institutionID: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    institutionCode: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    institutionName: Mapped[Optional[str]] = mapped_column(String(255))
    country: Mapped[Optional[str]] = mapped_column(String(100))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    address: Mapped[Optional[Text]] = mapped_column(Text())
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    webSite: Mapped[Optional[str]] = mapped_column(String(255))

    institution_admin_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True, unique=True
    )
    admin_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[institution_admin_user_id],
        lazy="joined",
    )

    users: Mapped[List["User"]] = relationship(
        "User",
        back_populates="institution",
        foreign_keys="[User.institution_id]",
        primaryjoin="User.institution_id == Institution.id",
        cascade="all, delete-orphan", # borrar usuarios al borrar institucion?
        passive_deletes=False,
    )

    collections: Mapped[List["Collection"]] = relationship(
        "Collection", back_populates="institution"
    )

class Collection(Base):
    """Colección física o virtual que alberga especímenes/registros.

    En DwC, Occurrence suele llevar collectionCode; aquí lo normalizamos y
    relacionamos opcionalmente.
    """

    __tablename__ = "collection"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    collectionID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)
    # Identificador estable (URI/UUID) de la colección
    collectionCode: Mapped[Optional[String]] = mapped_column(String(100), index=True)
    # Código (p.ej., "BOT", "ORN")
    collectionName: Mapped[Optional[String]] = mapped_column(String(255))
    description: Mapped[Optional[Text]] = mapped_column(Text())
    webSite: Mapped[Optional[String]] = mapped_column(String(255))

    institution_id: Mapped[Optional[int]] = mapped_column(ForeignKey("institution.id"))
    institution: Mapped[Optional[Institution]] = relationship("Institution", back_populates="collections")

    occurrences: Mapped[List[Occurrence]] = relationship("Occurrence", back_populates="collection")


class Agent(Base):
    """Persona u organización involucrada (colector, identificador, curador).

    DwC maneja recordedBy/identifiedBy como texto/identificadores; este modelo
    permite normalizar agentes si tu flujo lo requiere.
    """

    __tablename__ = "agent"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    agentID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)

    # agentType: Mapped[Optional[String]] = mapped_column(String(50)) # "Person" | "Organization"
    givenName: Mapped[Optional[String]] = mapped_column(String(100))
    familyName: Mapped[Optional[String]] = mapped_column(String(100))
    fullName: Mapped[Optional[String]] = mapped_column(String(255))
    # organizationName: Mapped[Optional[String]] = mapped_column(String(255))
    orcid: Mapped[Optional[String]] = mapped_column(String(50))
    # email: Mapped[Optional[String]] = mapped_column(String(255))
    phone: Mapped[Optional[String]] = mapped_column(String(50))
    address: Mapped[Optional[Text]] = mapped_column(Text())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    is_institution_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    agent_id: Mapped[int | None] = mapped_column(ForeignKey("agent.id"), nullable=True)
    agent: Mapped["Agent | None"] = relationship("Agent")

    institution_id: Mapped[int] = mapped_column(
        ForeignKey("institution.id"),
        nullable=False,
        index=True,
    )
    institution: Mapped["Institution"] = relationship(
        "Institution",
        back_populates="users",
        foreign_keys=[institution_id],
        primaryjoin="User.institution_id == Institution.id",
    )


class RegistrationRequest(Base):
    __tablename__ = "registration_request"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Datos de acceso solicitados
    username: Mapped[str] = mapped_column(String(100), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))

    # Institución
    institution_id: Mapped[int] = mapped_column(ForeignKey("institution.id"), nullable=False)
    institution: Mapped["Institution"] = relationship("Institution")

    # Curador
    full_name: Mapped[Optional[str]] = mapped_column(String(255))
    given_name: Mapped[Optional[str]] = mapped_column(String(100))
    family_name: Mapped[Optional[str]] = mapped_column(String(100))
    orcid: Mapped[Optional[str]] = mapped_column(String(50))
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    address: Mapped[Optional[Text]] = mapped_column(Text())

    status: Mapped[Literal["pending", "approved", "rejected"]] = mapped_column(
        Enum("pending", "approved", "rejected", name="registration_status_enum"),
        default="pending",
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    reviewed_by: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[reviewed_by_user_id]
    )

    resulting_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True, unique=True
    )
    resulting_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[resulting_user_id]
    )

    __table_args__ = (
        UniqueConstraint("email", "status", name="uq_request_email_status_pending",
                         deferrable=True, initially="DEFERRED"),
    )


class Reference(Base):
    """Referencia bibliográfica usada para nombres/identificaciones u otros.

    Mapea dwc:bibliographicCitation y metadatos asociados.
    """

    __tablename__ = "reference"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    referenceID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)
    # Identificador estable (URI/DOI/UUID)
    bibliographicCitation: Mapped[Optional[Text]] = mapped_column(Text())
    # Cita completa legible
    title: Mapped[Optional[String]] = mapped_column(String(500))
    creator: Mapped[Optional[String]] = mapped_column(String(255))
    publisher: Mapped[Optional[String]] = mapped_column(String(255))
    date: Mapped[Optional[String]] = mapped_column(String(50))
    source: Mapped[Optional[String]] = mapped_column(String(255))
    identifier: Mapped[Optional[String]] = mapped_column(String(255))
    # DOI/URL


class Taxon(Base):
    """Clasificación taxonómica y metadatos del nombre (DwC: Taxon)."""

    __tablename__ = "taxon"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    taxonID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)
    # Identificador estable del concepto taxonómico

    # Identificadores/relaciones nominales
    scientificNameID: Mapped[Optional[String]] = mapped_column(String(255))
    acceptedNameUsageID: Mapped[Optional[String]] = mapped_column(String(255))
    parentNameUsageID: Mapped[Optional[String]] = mapped_column(String(255))
    originalNameUsageID: Mapped[Optional[String]] = mapped_column(String(255))
    nameAccordingToID: Mapped[Optional[String]] = mapped_column(String(255))
    namePublishedInID: Mapped[Optional[String]] = mapped_column(String(255))
    taxonConceptID: Mapped[Optional[String]] = mapped_column(String(255))

    # Representaciones textuales
    acceptedNameUsage: Mapped[Optional[String]] = mapped_column(String(500))
    parentNameUsage: Mapped[Optional[String]] = mapped_column(String(500))
    originalNameUsage: Mapped[Optional[String]] = mapped_column(String(500))
    nameAccordingTo: Mapped[Optional[String]] = mapped_column(String(500))
    namePublishedIn: Mapped[Optional[String]] = mapped_column(String(500))
    namePublishedInYear: Mapped[Optional[String]] = mapped_column(String(20))
    higherClassification: Mapped[Optional[Text]] = mapped_column(Text())

    # Jerarquía
    kingdom: Mapped[Optional[String]] = mapped_column(String(100))
    phylum: Mapped[Optional[String]] = mapped_column(String(100))
    class_: Mapped[Optional[String]] = mapped_column("class", String(100))
    order: Mapped[Optional[String]] = mapped_column(String(100))
    family: Mapped[Optional[String]] = mapped_column(String(100))
    genus: Mapped[Optional[String]] = mapped_column(String(100))
    subgenus: Mapped[Optional[String]] = mapped_column(String(100))
    specificEpithet: Mapped[Optional[String]] = mapped_column(String(100))
    infraspecificEpithet: Mapped[Optional[String]] = mapped_column(String(100))
    taxonRank: Mapped[Optional[String]] = mapped_column(String(50))
    verbatimTaxonRank: Mapped[Optional[String]] = mapped_column(String(50))

    # Nombre científico
    scientificName: Mapped[Optional[String]] = mapped_column(String(500), index=True)
    scientificNameAuthorship: Mapped[Optional[String]] = mapped_column(String(255))

    # Estatus y códigos
    nomenclaturalCode: Mapped[Optional[String]] = mapped_column(String(100))
    taxonomicStatus: Mapped[Optional[String]] = mapped_column(String(100))
    nomenclaturalStatus: Mapped[Optional[String]] = mapped_column(String(100))

    taxonRemarks: Mapped[Optional[Text]] = mapped_column(Text())

    # Relaciones
    occurrences: Mapped[List[Occurrence]] = relationship("Occurrence", back_populates="taxon")


class GeologicalContext(Base):
    """Contexto geológico/estratigráfico del hallazgo (DwC: GeologicalContext)."""

    __tablename__ = "geological_context"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    geologicalContextID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)

    earliestEonOrLowestEonothem: Mapped[Optional[String]] = mapped_column(String(100))
    latestEonOrHighestEonothem: Mapped[Optional[String]] = mapped_column(String(100))
    earliestEraOrLowestErathem: Mapped[Optional[String]] = mapped_column(String(100))
    latestEraOrHighestErathem: Mapped[Optional[String]] = mapped_column(String(100))
    earliestPeriodOrLowestSystem: Mapped[Optional[String]] = mapped_column(String(100))
    latestPeriodOrHighestSystem: Mapped[Optional[String]] = mapped_column(String(100))
    earliestEpochOrLowestSeries: Mapped[Optional[String]] = mapped_column(String(100))
    latestEpochOrHighestSeries: Mapped[Optional[String]] = mapped_column(String(100))
    earliestAgeOrLowestStage: Mapped[Optional[String]] = mapped_column(String(100))
    latestAgeOrHighestStage: Mapped[Optional[String]] = mapped_column(String(100))
    lowestBiostratigraphicZone: Mapped[Optional[String]] = mapped_column(String(100))
    highestBiostratigraphicZone: Mapped[Optional[String]] = mapped_column(String(100))

    lithostratigraphicTerms: Mapped[Optional[String]] = mapped_column(String(255))
    group: Mapped[Optional[String]] = mapped_column(String(100))
    formation: Mapped[Optional[String]] = mapped_column(String(100))
    member: Mapped[Optional[String]] = mapped_column(String(100))
    bed: Mapped[Optional[String]] = mapped_column(String(100))

    occurrences: Mapped[List[Occurrence]] = relationship("Occurrence", back_populates="geological_context")


class Location(Base):
    """Ubicación geográfica y georreferenciación (DwC: Location)."""

    __tablename__ = "location"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    locationID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)

    higherGeographyID: Mapped[Optional[String]] = mapped_column(String(255))
    higherGeography: Mapped[Optional[Text]] = mapped_column(Text())
    continent: Mapped[Optional[String]] = mapped_column(String(100))
    waterBody: Mapped[Optional[String]] = mapped_column(String(100))
    islandGroup: Mapped[Optional[String]] = mapped_column(String(100))
    island: Mapped[Optional[String]] = mapped_column(String(100))

    country: Mapped[Optional[String]] = mapped_column(String(100))
    countryCode: Mapped[Optional[String]] = mapped_column(String(10))
    stateProvince: Mapped[Optional[String]] = mapped_column(String(100))
    county: Mapped[Optional[String]] = mapped_column(String(100))
    municipality: Mapped[Optional[String]] = mapped_column(String(100))
    locality: Mapped[Optional[Text]] = mapped_column(Text())
    verbatimLocality: Mapped[Optional[Text]] = mapped_column(Text())

    verbatimElevation: Mapped[Optional[String]] = mapped_column(String(100))
    minimumElevationInMeters: Mapped[Optional[Float]] = mapped_column(Float)
    maximumElevationInMeters: Mapped[Optional[Float]] = mapped_column(Float)

    verbatimDepth: Mapped[Optional[String]] = mapped_column(String(100))
    minimumDepthInMeters: Mapped[Optional[Float]] = mapped_column(Float)
    maximumDepthInMeters: Mapped[Optional[Float]] = mapped_column(Float)

    minimumDistanceAboveSurfaceInMeters: Mapped[Optional[Float]] = mapped_column(Float)
    maximumDistanceAboveSurfaceInMeters: Mapped[Optional[Float]] = mapped_column(Float)

    decimalLatitude: Mapped[Optional[Float]] = mapped_column(Float, index=True)
    decimalLongitude: Mapped[Optional[Float]] = mapped_column(Float, index=True)
    geodeticDatum: Mapped[Optional[String]] = mapped_column(String(50))
    coordinateUncertaintyInMeters: Mapped[Optional[Float]] = mapped_column(Float)
    coordinatePrecision: Mapped[Optional[Float]] = mapped_column(Float)

    verbatimCoordinates: Mapped[Optional[String]] = mapped_column(String(255))
    verbatimCoordinateSystem: Mapped[Optional[String]] = mapped_column(String(100))
    verbatimSRS: Mapped[Optional[String]] = mapped_column(String(100))

    footprintWKT: Mapped[Optional[Text]] = mapped_column(Text())
    footprintSRS: Mapped[Optional[String]] = mapped_column(String(50))
    footprintSpatialFit: Mapped[Optional[String]] = mapped_column(String(50))

    georeferencedBy: Mapped[Optional[String]] = mapped_column(String(255))
    georeferencedDate: Mapped[Optional[Date]] = mapped_column(Date)
    georeferenceProtocol: Mapped[Optional[String]] = mapped_column(String(255))
    georeferenceSources: Mapped[Optional[Text]] = mapped_column(Text())
    georeferenceVerificationStatus: Mapped[Optional[String]] = mapped_column(String(100))
    georeferenceRemarks: Mapped[Optional[Text]] = mapped_column(Text())

    locationAccordingTo: Mapped[Optional[String]] = mapped_column(String(255))
    locationRemarks: Mapped[Optional[Text]] = mapped_column(Text())

    events: Mapped[List[Event]] = relationship("Event", back_populates="location")
    occurrences: Mapped[List[Occurrence]] = relationship("Occurrence", back_populates="location")


class Event(Base):
    """Evento de colecta/muestreo (DwC: Event/SamplingEvent)."""

    __tablename__ = "event"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    eventID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)

    parentEventID: Mapped[Optional[String]] = mapped_column(String(255))

    eventDate: Mapped[Optional[String]] = mapped_column(String(100))
    # Rango/fecha ISO8601; usar String para conservar verbatim
    eventTime: Mapped[Optional[String]] = mapped_column(String(50))
    startDayOfYear: Mapped[Optional[Integer]] = mapped_column(Integer)
    endDayOfYear: Mapped[Optional[Integer]] = mapped_column(Integer)
    year: Mapped[Optional[Integer]] = mapped_column(Integer)
    month: Mapped[Optional[Integer]] = mapped_column(Integer)
    day: Mapped[Optional[Integer]] = mapped_column(Integer)
    verbatimEventDate: Mapped[Optional[String]] = mapped_column(String(100))

    habitat: Mapped[Optional[Text]] = mapped_column(Text())
    samplingProtocol: Mapped[Optional[String]] = mapped_column(String(255))
    samplingEffort: Mapped[Optional[String]] = mapped_column(String(255))

    fieldNumber: Mapped[Optional[String]] = mapped_column(String(100))
    fieldNotes: Mapped[Optional[Text]] = mapped_column(Text())
    eventRemarks: Mapped[Optional[Text]] = mapped_column(Text())

    location_id: Mapped[Optional[int]] = mapped_column(ForeignKey("location.id"))
    location: Mapped[Optional[Location]] = relationship("Location", back_populates="events")

    occurrences: Mapped[List[Occurrence]] = relationship("Occurrence", back_populates="event")



class Organism(Base):
    """Organismo biológico observado/muestreado (DwC: Organism).

    Útil para submuestras o varias Occurrence del mismo organismo.
    """

    __tablename__ = "organism"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    organismID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)

    organismName: Mapped[Optional[String]] = mapped_column(String(255))
    organismScope: Mapped[Optional[String]] = mapped_column(String(100))
    # Alcance de lo muestreado (individuo, colonia, etc.)
    associatedOrganisms: Mapped[Optional[Text]] = mapped_column(Text())
    previousIdentifications: Mapped[Optional[Text]] = mapped_column(Text())
    organismRemarks: Mapped[Optional[Text]] = mapped_column(Text())

    organismQuantity: Mapped[Optional[String]] = mapped_column(String(100))
    organismQuantityType: Mapped[Optional[String]] = mapped_column(String(100))
    sampleSizeValue: Mapped[Optional[Float]] = mapped_column(Float)
    sampleSizeUnit: Mapped[Optional[String]] = mapped_column(String(50))

    sex: Mapped[Optional[String]] = mapped_column(String(50))
    lifeStage: Mapped[Optional[String]] = mapped_column(String(50))
    reproductiveCondition: Mapped[Optional[String]] = mapped_column(String(100))
    behavior: Mapped[Optional[String]] = mapped_column(String(255))
    establishmentMeans: Mapped[Optional[String]] = mapped_column(String(100))

    occurrences: Mapped[List[Occurrence]] = relationship("Occurrence", back_populates="organism")
    identifications: Mapped[List[Identification]] = relationship("Identification", back_populates="organism")


class Identification(Base):
    """Acto de identificación taxonómica de un organismo/registro (DwC: Identification)."""

    __tablename__ = "identification"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    identificationID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)

    identifiedBy: Mapped[Optional[String]] = mapped_column(String(255))
    # Nombres de los identificadores
    identifiedByID: Mapped[Optional[String]] = mapped_column(String(255))
    # Identificadores de agente (p.ej., ORCID URIs)
    dateIdentified: Mapped[Optional[String]] = mapped_column(String(50))

    identificationReferences: Mapped[Optional[Text]] = mapped_column(Text())
    identificationVerificationStatus: Mapped[Optional[String]] = mapped_column(String(100))
    identificationRemarks: Mapped[Optional[Text]] = mapped_column(Text())
    identificationQualifier: Mapped[Optional[String]] = mapped_column(String(100))

    typeStatus: Mapped[Optional[String]] = mapped_column(String(100))
    # Holotype, Paratype, etc.

    occurrence_id: Mapped[Optional[int]] = mapped_column(ForeignKey("occurrence.id"))
    organism_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organism.id"))
    taxon_id: Mapped[Optional[int]] = mapped_column(ForeignKey("taxon.id"))

    occurrence: Mapped[Optional[Occurrence]] = relationship("Occurrence", back_populates="identifications")
    organism: Mapped[Optional[Organism]] = relationship("Organism", back_populates="identifications")
    taxon: Mapped[Optional[Taxon]] = relationship("Taxon")


class MeasurementOrFact(Base):
    """Medidas/atributos asociados a Occurrence/Event/Organism/Taxon (DwC: MoF)."""

    __tablename__ = "measurement_or_fact"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    measurementID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)

    measurementType: Mapped[Optional[String]] = mapped_column(String(255))
    # Qué se midió (p.ej., "body length", "pH")
    measurementTypeID: Mapped[Optional[String]] = mapped_column(String(255))
    measurementValue: Mapped[Optional[String]] = mapped_column(String(255))
    measurementValueID: Mapped[Optional[String]] = mapped_column(String(255))
    measurementUnit: Mapped[Optional[String]] = mapped_column(String(100))
    measurementUnitID: Mapped[Optional[String]] = mapped_column(String(255))
    measurementAccuracy: Mapped[Optional[String]] = mapped_column(String(100))
    measurementDeterminedBy: Mapped[Optional[String]] = mapped_column(String(255))
    measurementDeterminedDate: Mapped[Optional[String]] = mapped_column(String(50))
    measurementMethod: Mapped[Optional[Text]] = mapped_column(Text())
    measurementRemarks: Mapped[Optional[Text]] = mapped_column(Text())

    # Enlaces a recursos (uno de estos típicamente)
    occurrence_id: Mapped[Optional[int]] = mapped_column(ForeignKey("occurrence.id"))
    event_id: Mapped[Optional[int]] = mapped_column(ForeignKey("event.id"))
    organism_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organism.id"))
    taxon_id: Mapped[Optional[int]] = mapped_column(ForeignKey("taxon.id"))

    occurrence: Mapped[Optional[Occurrence]] = relationship("Occurrence", back_populates="measurements")
    event: Mapped[Optional[Event]] = relationship("Event")
    organism: Mapped[Optional[Organism]] = relationship("Organism")
    taxon: Mapped[Optional[Taxon]] = relationship("Taxon")


class Multimedia(Base):
    """Soporte multimedia simple (imagen/audio/video) vinculado a registros DwC.

    Términos toman como base Simple Multimedia; para metadatos ricos usar Audubon Core.
    """

    __tablename__ = "multimedia"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    mediaID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)

    identifier: Mapped[Optional[String]] = mapped_column(String(500))
    # URL/URI público del recurso (recomendado)
    type: Mapped[Optional[String]] = mapped_column(String(100))
    # Imagen, Sonido, Video, etc.
    format: Mapped[Optional[String]] = mapped_column(String(100))
    title: Mapped[Optional[String]] = mapped_column(String(500))
    description: Mapped[Optional[Text]] = mapped_column(Text())
    created: Mapped[Optional[String]] = mapped_column(String(50))
    creator: Mapped[Optional[String]] = mapped_column(String(255))
    contributor: Mapped[Optional[String]] = mapped_column(String(255))
    publisher: Mapped[Optional[String]] = mapped_column(String(255))
    audience: Mapped[Optional[String]] = mapped_column(String(255))
    source: Mapped[Optional[String]] = mapped_column(String(255))
    license: Mapped[Optional[String]] = mapped_column(String(255))
    rightsHolder: Mapped[Optional[String]] = mapped_column(String(255))
    accessRights: Mapped[Optional[String]] = mapped_column(String(255))
    bibliographicCitation: Mapped[Optional[Text]] = mapped_column(Text())
    references: Mapped[Optional[String]] = mapped_column(String(500))

    # Enlaces contextuales
    occurrence_id: Mapped[Optional[int]] = mapped_column(ForeignKey("occurrence.id"))
    event_id: Mapped[Optional[int]] = mapped_column(ForeignKey("event.id"))
    organism_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organism.id"))
    taxon_id: Mapped[Optional[int]] = mapped_column(ForeignKey("taxon.id"))

    occurrence: Mapped[Optional[Occurrence]] = relationship("Occurrence", back_populates="media")
    event: Mapped[Optional[Event]] = relationship("Event")
    organism: Mapped[Optional[Organism]] = relationship("Organism")
    taxon: Mapped[Optional[Taxon]] = relationship("Taxon")


class ResourceRelationship(Base):
    """Relaciones semánticas entre recursos (p.ej., depredador→presa, duplicado de).

    Implementación genérica con IDs y tipos; en exportación se mapea a dwc:resourceID,
    dwc:relatedResourceID y dwc:relationshipOfResource.
    """

    __tablename__ = "resource_relationship"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    relationshipID: Mapped[Optional[String]] = mapped_column(String(255), unique=True)

    resourceID: Mapped[Optional[String]] = mapped_column(String(255), index=True)
    relatedResourceID: Mapped[Optional[String]] = mapped_column(String(255), index=True)
    resourceType: Mapped[Optional[String]] = mapped_column(String(100))
    relatedResourceType: Mapped[Optional[String]] = mapped_column(String(100))

    relationshipOfResource: Mapped[Optional[String]] = mapped_column(String(255))
    relationshipAccordingTo: Mapped[Optional[String]] = mapped_column(String(255))
    relationshipEstablishedDate: Mapped[Optional[String]] = mapped_column(String(50))
    relationshipRemarks: Mapped[Optional[Text]] = mapped_column(Text())

    # Punteros opcionales cuando el recurso es una Occurrence local
    occurrence_id: Mapped[Optional[int]] = mapped_column(ForeignKey("occurrence.id"))

    occurrence: Mapped[Optional[Occurrence]] = relationship("Occurrence", back_populates="relationships")


class Occurrence(Base):
    """Registro núcleo: ejemplar/avistamiento (DwC: Occurrence).
    Para herbario (pliegos), mantenemos lo esencial y dejamos comentado lo prescindible.
    """

    __tablename__ = "occurrence"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ---- Identificación única del registro ----
    occurrenceID: Mapped[Optional[String]] = mapped_column(String(255), unique=True, index=True)
    # ↑ Recomendado (UUID/URI) para interoperabilidad DwC-Archive/GBIF.

    # ---- Identificación de catálogo / colecciones ----
    catalogNumber: Mapped[Optional[String]] = mapped_column(String(100), index=True)
    recordNumber: Mapped[Optional[String]] = mapped_column(String(100))
    # otherCatalogNumbers: Mapped[Optional[String]] = mapped_column(String(255))
    # ↑ Suele ser útil solo si mantienes códigos históricos o duplicados; si no, omítelo.

    # ---- Quién registró ----
    recordedBy: Mapped[Optional[String]] = mapped_column(String(255))
    recordedByID: Mapped[Optional[String]] = mapped_column(String(255))
    # ↑ recordedByID solo si normalizas agentes; si no usas Agent/ORCID, puedes omitirlo.

    # ---- Abundancia y atributos biológicos ----
    individualCount: Mapped[Optional[Integer]] = mapped_column(Integer)
    # organismQuantity: Mapped[Optional[String]] = mapped_column(String(100))          # para monitoreo/censos, rara vez en pliegos
    # organismQuantityType: Mapped[Optional[String]] = mapped_column(String(100))      # ídem
    # sex: Mapped[Optional[String]] = mapped_column(String(50))                        # en plantas casi no aplica
    # lifeStage: Mapped[Optional[String]] = mapped_column(String(50))                  # puedes reflejar fenología en remarks
    # reproductiveCondition: Mapped[Optional[String]] = mapped_column(String(100))     # fenología suele ir en remarks o MoF
    # behavior: Mapped[Optional[String]] = mapped_column(String(255))                  # no aplica a pliegos de herbario

    # ---- Establecimiento / invasiones (útil si trabajas exóticas) ----
    # establishmentMeans: Mapped[Optional[String]] = mapped_column(String(100))        # "native", "introduced", "cultivated"...
    # pathway: Mapped[Optional[String]] = mapped_column(String(255))                   # vía de introducción; nicho de invasoras
    # degreeOfEstablishment: Mapped[Optional[String]] = mapped_column(String(100))     # grado de establecimiento
    occurrenceStatus: Mapped[Optional[String]] = mapped_column(String(50))  # present/absent
    # ↑ Mantener, por claridad en exportes (aunque casi siempre "present").

    # ---- Curaduría ----
    preparations: Mapped[Optional[String]] = mapped_column(String(255))  # p.ej. "herbarium sheet"
    disposition: Mapped[Optional[String]] = mapped_column(String(255))   # p.ej. "in collection", "on loan"

    # ---- Asociados (mejor normalizar en tablas específicas) ----
    # associatedMedia: Mapped[Optional[Text]] = mapped_column(Text())       # usa tabla Multimedia en su lugar
    # associatedReferences: Mapped[Optional[Text]] = mapped_column(Text())  # usa tabla Reference si la tienes
    # associatedSequences: Mapped[Optional[Text]] = mapped_column(Text())   # enlaza por campo específico/tabla si aplica
    # associatedTaxa: Mapped[Optional[Text]] = mapped_column(Text())        # usa ResourceRelationship/Identification

    occurrenceRemarks: Mapped[Optional[Text]] = mapped_column(Text())
    # Campo libre súper útil: fenología, sustrato, microhábitat, notas de etiqueta.

    # ---- Record-level (metadatos de publicación) ----
    # type: Mapped[Optional[String]] = mapped_column(String(100))           # suele ser "PhysicalObject"; prescindible
    modified: Mapped[Optional[DateTime]] = mapped_column(DateTime)          # marca de última edición (útil)
    # language: Mapped[Optional[String]] = mapped_column(String(50))        # solo si mezclas idiomas y te importa declararlo
    license: Mapped[Optional[String]] = mapped_column(String(255))          # p.ej. "CC BY 4.0"
    rightsHolder: Mapped[Optional[String]] = mapped_column(String(255))
    accessRights: Mapped[Optional[String]] = mapped_column(String(255))
    bibliographicCitation: Mapped[Optional[Text]] = mapped_column(Text())   # rara vez en el registro; más en Reference/Multimedia
    # references: Mapped[Optional[String]] = mapped_column(String(500))     # URL ficha pública; úsalo si no tienes Reference
    # informationWithheld: Mapped[Optional[Text]] = mapped_column(Text())   # útil si ocultas coordenadas de especies sensibles
    # dataGeneralizations: Mapped[Optional[Text]] = mapped_column(Text())   # explica generalizaciones de datos (coordenadas)
    # dynamicProperties: Mapped[Optional[Text]] = mapped_column(Text())     # JSON libre para extensiones rápidas

    # ---- Códigos redundantes si ya normalizas Collection ----
    institutionCode: Mapped[Optional[String]] = mapped_column(String(100)) # mejor inferir vía collection->institution
    collectionCode: Mapped[Optional[String]] = mapped_column(String(100))

    # ---- Normalización con tablas de autoridad ----
    collection_id: Mapped[Optional[int]] = mapped_column(ForeignKey("collection.id"))
    collection: Mapped[Optional["Collection"]] = relationship("Collection", back_populates="occurrences")

    # ---- Enlaces principales (lo clave para herbario) ----
    event_id: Mapped[Optional[int]] = mapped_column(ForeignKey("event.id"), index=True)
    location_id: Mapped[Optional[int]] = mapped_column(ForeignKey("location.id"), index=True)
    geological_context_id: Mapped[Optional[int]] = mapped_column(ForeignKey("geological_context.id"))
    taxon_id: Mapped[Optional[int]] = mapped_column(ForeignKey("taxon.id"), index=True)
    organism_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organism.id"))

    event: Mapped[Optional["Event"]] = relationship("Event", back_populates="occurrences")
    location: Mapped[Optional["Location"]] = relationship("Location", back_populates="occurrences")
    geological_context: Mapped[Optional["GeologicalContext"]] = relationship("GeologicalContext", back_populates="occurrences")
    taxon: Mapped[Optional["Taxon"]] = relationship("Taxon", back_populates="occurrences")
    organism: Mapped[Optional["Organism"]] = relationship("Organism", back_populates="occurrences")

    # ---- Relaciones dependientes (muy útiles) ----
    identifications: Mapped[List["Identification"]] = relationship("Identification", back_populates="occurrence")
    measurements: Mapped[List["MeasurementOrFact"]] = relationship("MeasurementOrFact", back_populates="occurrence")
    media: Mapped[List["Multimedia"]] = relationship("Multimedia", back_populates="occurrence")
    relationships: Mapped[List["ResourceRelationship"]] = relationship("ResourceRelationship", back_populates="occurrence")



Index("ix_location_latlon", Location.decimalLatitude, Location.decimalLongitude)
Index("ix_occurrence_catalog", Occurrence.catalogNumber, Occurrence.collectionCode)
Index("ix_event_date", Event.year, Event.month, Event.day)
