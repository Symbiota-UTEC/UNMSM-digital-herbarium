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
    admin_user: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[institution_admin_user_id],
        lazy="joined",
    )

    usersCount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
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

    creator_agent_id: Mapped[int] = mapped_column(
        ForeignKey("agent.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    creator: Mapped["Agent"] = relationship("Agent", back_populates="collections")

    occurrences: Mapped[List["Occurrence"]] = relationship("Occurrence", back_populates="collection")

    permissions: Mapped[List["CollectionPermission"]] = relationship(
        "CollectionPermission",
        back_populates="collection",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

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

    collections: Mapped[List["Collection"]] = relationship(
        "Collection",
        back_populates="creator",
        cascade="save-update",
        passive_deletes=True,
    )

    occurrences: Mapped[list["Occurrence"]] = relationship(
        "Occurrence",
        back_populates="agent",
        cascade="save-update",
        passive_deletes=True,
        lazy="selectin",
    )


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

    agent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("agent.id"), nullable=True)
    agent: Mapped[Optional["Agent"]] = relationship("Agent")

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

    collection_permissions: Mapped[List["CollectionPermission"]] = relationship(
        "CollectionPermission",
        back_populates="user",
        foreign_keys=lambda: [CollectionPermission.user_id],
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class CollectionPermission(Base):
    __tablename__ = "collection_permission"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    collection_id: Mapped[int] = mapped_column(ForeignKey("collection.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)

    role: Mapped[str] = mapped_column(
        Enum("viewer", "editor", "owner", name="collection_permission_enum"),
        nullable=False,
        index=True,
    )
    granted_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    collection: Mapped["Collection"] = relationship("Collection", back_populates="permissions")
    user: Mapped["User"] = relationship(
        "User",
        back_populates="collection_permissions",
        foreign_keys=[user_id],
    )
    granted_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[granted_by_user_id])

    __table_args__ = (
        UniqueConstraint("collection_id", "user_id", name="uq_collection_user"),
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

    # ---- Quién registró ----
    recordedBy: Mapped[Optional[String]] = mapped_column(String(255))
    recordEnteredBy: Mapped[Optional[String]] = mapped_column(String(255))

    # ↑ recordedByID solo si normalizas agentes; si no usas Agent/ORCID, puedes omitirlo.

    # ---- Abundancia y atributos biológicos ----
    individualCount: Mapped[Optional[Integer]] = mapped_column(Integer)
    occurrenceStatus: Mapped[Optional[String]] = mapped_column(String(50))  # present/absent

    # ---- Curaduría ----
    preparations: Mapped[Optional[String]] = mapped_column(String(255))  # p.ej. "herbarium sheet"
    disposition: Mapped[Optional[String]] = mapped_column(String(255))   # p.ej. "in collection", "on loan"

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

    # ---- Normalización con tablas de autoridad ----
    collection_id: Mapped[Optional[int]] = mapped_column(ForeignKey("collection.id"))
    collection: Mapped[Optional["Collection"]] = relationship("Collection", back_populates="occurrences")

    agent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("agent.id"))
    agent: Mapped[Optional["Agent"]] = relationship("Agent", back_populates="occurrences")

    # ---- Enlaces principales (lo clave para herbario) ----
    event_id: Mapped[Optional[int]] = mapped_column(ForeignKey("event.id"), index=True)
    location_id: Mapped[Optional[int]] = mapped_column(ForeignKey("location.id"), index=True)
    taxon_id: Mapped[Optional[int]] = mapped_column(ForeignKey("taxon.id"), index=True)

    event: Mapped[Optional["Event"]] = relationship("Event", back_populates="occurrences")
    location: Mapped[Optional["Location"]] = relationship("Location", back_populates="occurrences")
    taxon: Mapped[Optional["Taxon"]] = relationship("Taxon", back_populates="occurrences")

    relationships: Mapped[List["ResourceRelationship"]] = relationship("ResourceRelationship", back_populates="occurrence")


Index("ix_location_latlon", Location.decimalLatitude, Location.decimalLongitude)
Index("ix_occurrence_catalog", Occurrence.catalogNumber, Occurrence.collection_id)
Index("ix_event_date", Event.year, Event.month, Event.day)
