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

from typing import List, Optional, Literal, Any

from sqlalchemy import (
    String,
    Text,
    Integer,
    Float,
    DateTime,
    Boolean,
    ForeignKey,
    UniqueConstraint,
    Index,
    Enum,
    Date,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

from backend.config.database import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, date


class Institution(Base):
    __tablename__ = "institution"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # institutionID: Mapped[Optional[str]] = mapped_column(
    #     "institution_id", String(255), unique=True
    # )
    institutionCode: Mapped[Optional[str]] = mapped_column(
        "institution_code", String(100), index=True
    )
    institutionName: Mapped[Optional[str]] = mapped_column(
        "institution_name", String(255)
    )
    country: Mapped[Optional[str]] = mapped_column("country", String(100))
    city: Mapped[Optional[str]] = mapped_column("city", String(100))
    address: Mapped[Optional[Text]] = mapped_column("address", Text())
    email: Mapped[Optional[str]] = mapped_column("email", String(255))
    phone: Mapped[Optional[str]] = mapped_column("phone", String(50))
    webSite: Mapped[Optional[str]] = mapped_column("web_site", String(255))

    institutionAdminUserId: Mapped[Optional[int]] = mapped_column(
        "institution_admin_user_id", ForeignKey("users.id"), nullable=True, unique=True
    )
    institutionAdminUser: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[institutionAdminUserId],
        lazy="joined",
    )

    usersCount: Mapped[int] = mapped_column(
        "users_count", Integer, default=0, nullable=False
    )
    users: Mapped[List["User"]] = relationship(
        "User",
        back_populates="institution",
        foreign_keys="[User.institutionId]",
        primaryjoin="User.institutionId == Institution.id",
        cascade="all, delete-orphan",
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
    # collectionID: Mapped[Optional[String]] = mapped_column(
    #     "collection_id", String(255), unique=True
    # )
    # Identificador estable (URI/UUID) de la colección
    collectionCode: Mapped[Optional[String]] = mapped_column(
        "collection_code", String(100), index=True
    )
    # Código (p.ej., "BOT", "ORN")
    collectionName: Mapped[Optional[String]] = mapped_column(
        "collection_name", String(255)
    )
    description: Mapped[Optional[Text]] = mapped_column("description", Text())
    # webSite: Mapped[Optional[String]] = mapped_column("web_site", String(255))

    institutionId: Mapped[Optional[int]] = mapped_column(
        "institution_id", ForeignKey("institution.id")
    )
    institution: Mapped[Optional["Institution"]] = relationship(
        "Institution", back_populates="collections"
    )

    # El creador es un User, no un Agent
    creatorUserId: Mapped[int] = mapped_column(
        "creator_user_id",
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    creator: Mapped["User"] = relationship(
        "User",
        back_populates="collectionsCreated",
        foreign_keys=[creatorUserId],
    )

    occurrences: Mapped[List["Occurrence"]] = relationship(
        "Occurrence", back_populates="collection"
    )

    permissions: Mapped[List["CollectionPermission"]] = relationship(
        "CollectionPermission",
        back_populates="collection",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Agent(Base):
    """Persona asociada a la recolección de especímenes (colector de campo, etc.).
    NO está acoplada a las cuentas de usuario del sistema.
    """

    __tablename__ = "agent"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Campos básicos de identidad del colector
    fullName: Mapped[Optional[String]] = mapped_column("full_name", String(255))
    orcID: Mapped[Optional[String]] = mapped_column(
        "agent_id", String(255), unique=True
    )  # p.ej. ORCID u otro identificador estable

    # Ocurrencias en las que esta persona fue colectora (muchos-a-muchos)
    occurrences: Mapped[List["Occurrence"]] = relationship(
        "Occurrence",
        secondary="occurrence_agent",
        back_populates="agents",
        lazy="selectin",
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column("username", String(100), unique=True, index=True)
    email: Mapped[str] = mapped_column("email", String(255), unique=True, index=True)
    hashedPassword: Mapped[str] = mapped_column("hashed_password", String(255))
    isActive: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    isSuperuser: Mapped[bool] = mapped_column("is_superuser", Boolean, default=False)
    isInstitutionAdmin: Mapped[bool] = mapped_column(
        "is_institution_admin", Boolean, default=False
    )
    createdAt: Mapped[datetime] = mapped_column(
        "created_at", DateTime, default=datetime.utcnow
    )

    # Datos personales del usuario (curador/digitalizador)
    givenName: Mapped[Optional[String]] = mapped_column("given_name", String(100))
    familyName: Mapped[Optional[String]] = mapped_column("family_name", String(100))
    fullName: Mapped[Optional[String]] = mapped_column("full_name", String(255))
    orcid: Mapped[Optional[String]] = mapped_column("orcid", String(50))
    phone: Mapped[Optional[String]] = mapped_column("phone", String(50))
    address: Mapped[Optional[Text]] = mapped_column("address", Text())

    # Importante: User y Agent están desacoplados (no hay agentId aquí)

    institutionId: Mapped[int] = mapped_column(
        "institution_id",
        ForeignKey("institution.id"),
        nullable=False,
        index=True,
    )
    institution: Mapped["Institution"] = relationship(
        "Institution",
        back_populates="users",
        foreign_keys=[institutionId],
        primaryjoin="User.institutionId == Institution.id",
    )

    # Colecciones creadas por este usuario
    collectionsCreated: Mapped[List["Collection"]] = relationship(
        "Collection",
        back_populates="creator",
        foreign_keys=lambda: [Collection.creatorUserId],
    )

    collectionPermissions: Mapped[List["CollectionPermission"]] = relationship(
        "CollectionPermission",
        back_populates="user",
        foreign_keys=lambda: [CollectionPermission.userId],
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Ocurrencias digitalizadas por este usuario
    occurrencesDigitized: Mapped[List["Occurrence"]] = relationship(
        "Occurrence",
        back_populates="digitizerUser",
        foreign_keys=lambda: [Occurrence.digitizerUserId],
    )


class CollectionPermission(Base):
    __tablename__ = "collection_permission"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    collectionId: Mapped[int] = mapped_column(
        "collection_id",
        ForeignKey("collection.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    userId: Mapped[int] = mapped_column(
        "user_id",
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        "role",
        Enum("viewer", "editor", "owner", name="collection_permission_enum"),
        nullable=False,
        index=True,
    )
    grantedByUserId: Mapped[Optional[int]] = mapped_column(
        "granted_by_user_id", ForeignKey("users.id"), nullable=True
    )
    createdAt: Mapped[datetime] = mapped_column(
        "created_at", DateTime, default=datetime.utcnow, nullable=False
    )

    collection: Mapped["Collection"] = relationship(
        "Collection", back_populates="permissions"
    )
    user: Mapped["User"] = relationship(
        "User",
        back_populates="collectionPermissions",
        foreign_keys=[userId],
    )
    grantedBy: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[grantedByUserId]
    )

    __table_args__ = (
        UniqueConstraint("collection_id", "user_id", name="uq_collection_user"),
    )


class RegistrationRequest(Base):
    __tablename__ = "registration_request"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Datos de acceso solicitados
    username: Mapped[str] = mapped_column("username", String(100), index=True)
    email: Mapped[str] = mapped_column("email", String(255), index=True)
    hashedPassword: Mapped[str] = mapped_column("hashed_password", String(255))

    # Institución
    institutionId: Mapped[int] = mapped_column(
        "institution_id", ForeignKey("institution.id"), nullable=False
    )
    institution: Mapped["Institution"] = relationship("Institution")

    # Curador (datos personales solicitados)
    fullName: Mapped[Optional[str]] = mapped_column("full_name", String(255))
    givenName: Mapped[Optional[str]] = mapped_column("given_name", String(100))
    familyName: Mapped[Optional[str]] = mapped_column("family_name", String(100))
    orcid: Mapped[Optional[str]] = mapped_column("orcid", String(50))
    phone: Mapped[Optional[str]] = mapped_column("phone", String(50))
    address: Mapped[Optional[Text]] = mapped_column("address", Text())

    status: Mapped[Literal["pending", "approved", "rejected"]] = mapped_column(
        "status",
        Enum("pending", "approved", "rejected", name="registration_status_enum"),
        default="pending",
        index=True,
    )
    createdAt: Mapped[datetime] = mapped_column(
        "created_at", DateTime, default=datetime.utcnow, index=True
    )
    reviewedAt: Mapped[Optional[datetime]] = mapped_column(
        "reviewed_at", DateTime, nullable=True
    )

    reviewedByUserId: Mapped[Optional[int]] = mapped_column(
        "reviewed_by_user_id", ForeignKey("users.id"), nullable=True
    )
    reviewedBy: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[reviewedByUserId]
    )

    resultingUserId: Mapped[Optional[int]] = mapped_column(
        "resulting_user_id", ForeignKey("users.id"), nullable=True, unique=True
    )
    resultingUser: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[resultingUserId]
    )

    __table_args__ = (
        UniqueConstraint(
            "email",
            "status",
            name="uq_request_email_status_pending",
            deferrable=True,
            initially="DEFERRED",
        ),
    )


class Taxon(Base):
    """Clasificación taxonómica basada en el classification.csv de WFO (DwC: Taxon)."""

    __tablename__ = "taxon"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    taxonID: Mapped[Optional[String]] = mapped_column(
        "taxon_id", String(255), unique=True, index=True
    )
    scientificNameID: Mapped[Optional[String]] = mapped_column(
        "scientific_name_id", String(255)
    )
    localID: Mapped[Optional[String]] = mapped_column(
        "local_id", String(255)
    )
    scientificName: Mapped[Optional[String]] = mapped_column(
        "scientific_name", String(500), index=True
    )
    taxonRank: Mapped[Optional[String]] = mapped_column(
        "taxon_rank", String(50)
    )
    parentNameUsageID: Mapped[Optional[String]] = mapped_column(
        "parent_name_usage_id", String(255)
    )

    scientificNameAuthorship: Mapped[Optional[String]] = mapped_column(
        "scientific_name_authorship", String(255)
    )
    family: Mapped[Optional[String]] = mapped_column(
        "family", String(100)
    )
    subfamily: Mapped[Optional[String]] = mapped_column(
        "subfamily", String(100)
    )
    tribe: Mapped[Optional[String]] = mapped_column(
        "tribe", String(100)
    )
    subtribe: Mapped[Optional[String]] = mapped_column(
        "subtribe", String(100)
    )
    genus: Mapped[Optional[String]] = mapped_column(
        "genus", String(100)
    )
    subgenus: Mapped[Optional[String]] = mapped_column(
        "subgenus", String(100)
    )
    specificEpithet: Mapped[Optional[String]] = mapped_column(
        "specific_epithet", String(100)
    )
    infraspecificEpithet: Mapped[Optional[String]] = mapped_column(
        "infraspecific_epithet", String(100)
    )
    verbatimTaxonRank: Mapped[Optional[String]] = mapped_column(
        "verbatim_taxon_rank", String(50)
    )
    nomenclaturalStatus: Mapped[Optional[String]] = mapped_column(
        "nomenclatural_status", String(100)
    )

    namePublishedIn: Mapped[Optional[String]] = mapped_column(
        "name_published_in", String(500)
    )
    taxonomicStatus: Mapped[Optional[String]] = mapped_column(
        "taxonomic_status", String(100)
    )
    acceptedNameUsageID: Mapped[Optional[String]] = mapped_column(
        "accepted_name_usage_id", String(255)
    )
    originalNameUsageID: Mapped[Optional[String]] = mapped_column(
        "original_name_usage_id", String(255)
    )
    nameAccordingToID: Mapped[Optional[String]] = mapped_column(
        "name_according_to_id", String(255)
    )
    taxonRemarks: Mapped[Optional[Text]] = mapped_column(
        "taxon_remarks", Text()
    )

    created: Mapped[Optional[date]] = mapped_column("created", Date)
    modified: Mapped[Optional[date]] = mapped_column("modified", Date)

    # Flora fields
    references: Mapped[Optional[Text]] = mapped_column(
        "references", Text()
    )
    source: Mapped[Optional[String]] = mapped_column(
        "source", String(255)
    )
    majorGroup: Mapped[Optional[String]] = mapped_column(
        "major_group", String(100)
    )
    tplID: Mapped[Optional[String]] = mapped_column(
        "tpl_id", String(100)
    )

    # Flag: aparece en el último Excel de Flora?
    isCurrent: Mapped[bool] = mapped_column(
        "is_current",
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    # Relación inversa con Identification
    identifications: Mapped[List["Identification"]] = relationship(
        "Identification",
        back_populates="taxon",
    )


class Occurrence(Base):
    """
    Registro núcleo de ocurrencia (DwC: Occurrence) APLANADO:
    incluye campos de Occurrence + Event + Location en una sola tabla.

    Los campos se agrupan por prioridad:
    - Obligatorios: mínimos para un registro útil en el herbario.
    - Deseables (nice to have): muy recomendados para calidad de datos.
    - Opcionales: información adicional valiosa pero no crítica.
    """

    __tablename__ = "occurrence"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ------------------------------------------------------------------
    # OBLIGATORIOS (Occurrence + Event + Location)
    # ------------------------------------------------------------------

    # ---- Occurrence core ----
    recordNumber: Mapped[Optional[String]] = mapped_column(
        "record_number",
        String(100),
        doc="DwC recordNumber: número / código de colecta asignado por el colector.",
    )
    recordedBy: Mapped[Optional[String]] = mapped_column(
        "recorded_by",
        String(255),
        doc="DwC recordedBy: nombres de colectores, en orden de importancia.",
    )
    catalogNumber: Mapped[Optional[String]] = mapped_column(
        "catalog_number",
        String(100),
        index=True,
        doc="DwC catalogNumber: identificador dentro de la colección (número de pliego, etc.).",
    )

    # ---- Event mínimo ----
    verbatimEventDate: Mapped[Optional[String]] = mapped_column(
        "verbatim_event_date",
        String(100),
        doc="DwC verbatimEventDate: fecha del evento tal como aparece en la etiqueta.",
    )

    # ---- Location mínimos (según tu tabla: OBLIGATORIOS) ----
    country: Mapped[Optional[String]] = mapped_column(
        "country",
        String(100),
        doc="DwC country: nombre del país (p.ej. 'Peru').",
    )
    stateProvince: Mapped[Optional[String]] = mapped_column(
        "state_province",
        String(100),
        doc="DwC stateProvince: departamento/región.",
    )
    verbatimLocality: Mapped[Optional[Text]] = mapped_column(
        "verbatim_locality",
        Text(),
        doc="DwC verbatimLocality: descripción textual tal como en la etiqueta (más informal/dinámico).",
    )

    # ------------------------------------------------------------------
    # DESEABLES (nice to have)
    # ------------------------------------------------------------------

    # ---- Occurrence deseable ----
    organismQuantity: Mapped[Optional[String]] = mapped_column(
        "organism_quantity",
        String(100),
        doc="DwC organismQuantity: cantidad de organismos (número o descriptor).",
    )
    organismQuantityType: Mapped[Optional[String]] = mapped_column(
        "organism_quantity_type",
        String(100),
        doc="DwC organismQuantityType: tipo de unidad (individuos, ramas, colonias, etc.).",
    )
    georeferenceVerificationStatus: Mapped[Optional[String]] = mapped_column(
        "georeference_verification_status",
        String(100),
        doc="DwC georeferenceVerificationStatus: estado de verificación de la georreferenciación.",
    )
    otherCatalogNumbers: Mapped[Optional[String]] = mapped_column(
        "other_catalog_numbers",
        String(255),
        doc="DwC otherCatalogNumbers: otros identificadores de catálogo asociados.",
    )

    # ---- Event deseable ----
    eventDate: Mapped[Optional[String]] = mapped_column(
        "event_date",
        String(100),
        doc="DwC eventDate: fecha/rango ISO8601 normalizado del evento.",
    )
    habitat: Mapped[Optional[Text]] = mapped_column(
        "habitat",
        Text(),
        doc="DwC habitat: descripción del hábitat.",
    )
    eventRemarks: Mapped[Optional[Text]] = mapped_column(
        "event_remarks",
        Text(),
        doc="DwC eventRemarks: notas adicionales sobre el evento de muestreo.",
    )

    year: Mapped[Optional[Integer]] = mapped_column(
        "year",
        Integer,
        doc="Año del evento de colecta.",
    )
    month: Mapped[Optional[Integer]] = mapped_column(
        "month",
        Integer,
        doc="Mes del evento de colecta (1-12).",
    )
    day: Mapped[Optional[Integer]] = mapped_column(
        "day",
        Integer,
        doc="Día del mes del evento de colecta.",
    )

    # Location: deseable
    verbatimElevation: Mapped[Optional[String]] = mapped_column(
        "verbatim_elevation",
        String(100),
        doc="DwC verbatimElevation: elevación tal como en la etiqueta (con unidades, rangos, etc.).",
    )
    county: Mapped[Optional[String]] = mapped_column(
        "county",
        String(100),
        doc="DwC county: provincia (nice to have).",
    )
    municipality: Mapped[Optional[String]] = mapped_column(
        "municipality",
        String(100),
        doc="DwC municipality: distrito/municipio (nice to have).",
    )
    locality: Mapped[Optional[Text]] = mapped_column(
        "locality",
        Text(),
        doc="DwC locality: localidad oficial (centro poblado, caserío, etc.) (nice to have).",
    )
    locationRemarks: Mapped[Optional[Text]] = mapped_column(
        "location_remarks",
        Text(),
        doc="DwC locationRemarks: comentarios adicionales sobre la ubicación (nice to have).",
    )
    decimalLatitude: Mapped[Optional[Float]] = mapped_column(
        "decimal_latitude",
        Float,
        index=True,
        doc="DwC decimalLatitude: latitud en grados decimales (WGS84) (nice to have).",
    )
    decimalLongitude: Mapped[Optional[Float]] = mapped_column(
        "decimal_longitude",
        Float,
        index=True,
        doc="DwC decimalLongitude: longitud en grados decimales (WGS84) (nice to have).",
    )
    georeferencedBy: Mapped[Optional[String]] = mapped_column(
        "georeferenced_by",
        String(255),
        doc="DwC georeferencedBy: persona(s) que georreferenciaron el registro (nice to have).",
    )
    georeferenceRemarks: Mapped[Optional[Text]] = mapped_column(
        "georeference_remarks",
        Text(),
        doc="DwC georeferenceRemarks: notas sobre cómo se obtuvo la georreferenciación (nice to have).",
    )

    # OPCIONALES

    # ---- Occurrence opcionales ----
    occurrenceRemarks: Mapped[Optional[Text]] = mapped_column(
        "occurrence_remarks",
        Text(),
        doc="DwC occurrenceRemarks: notas sobre la ocurrencia (fenología, sustrato, microhábitat, etc.).",
    )
    lifeStage: Mapped[Optional[String]] = mapped_column(
        "life_stage",
        String(100),
        doc="DwC lifeStage: etapa de vida del organismo (plántula, adulto, flor, fruto, etc.).",
    )
    establishmentMeans: Mapped[Optional[String]] = mapped_column(
        "establishment_means",
        String(100),
        doc="DwC establishmentMeans: nativo, introducido, cultivado, etc.",
    )
    associatedReferences: Mapped[Optional[Text]] = mapped_column(
        "associated_references",
        Text(),
        doc="DwC associatedReferences: referencias bibliográficas ligadas a esta ocurrencia.",
    )
    associatedTaxa: Mapped[Optional[Text]] = mapped_column(
        "associated_taxa",
        Text(),
        doc="DwC associatedTaxa: taxa asociados (huésped, parásito, simbionte, etc.).",
    )
    dynamicProperties: Mapped[Optional[dict[str, Any]]] = mapped_column(
        "dynamic_properties",
        JSONB,
        nullable=True,
        default=dict,
        doc="DwC dynamicProperties: JSON con propiedades adicionales.",
    )

    # ---- Event opcionales ----
    projectTitle: Mapped[Optional[String]] = mapped_column(
        "project_title",
        String(255),
        doc="Título o nombre del proyecto/campaña de muestreo.",
    )
    sampleSizeValue: Mapped[Optional[Float]] = mapped_column(
        "sample_size_value",
        Float,
        doc="DwC sampleSizeValue: tamaño de muestra numérico (número de unidades muestreadas).",
    )
    sampleSizeUnit: Mapped[Optional[String]] = mapped_column(
        "sample_size_unit",
        String(100),
        doc="DwC sampleSizeUnit: unidad del tamaño de muestra (parcels, plots, traps, etc.).",
    )
    fieldNotes: Mapped[Optional[Text]] = mapped_column(
        "field_notes",
        Text(),
        doc="DwC fieldNotes: notas de campo tal como en la libreta.",
    )
    projectID: Mapped[Optional[String]] = mapped_column(
        "project_id",
        String(255),
        doc="Identificador interno o externo del proyecto (código de proyecto, grant, etc.).",
    )
    fundingAttribution: Mapped[Optional[Text]] = mapped_column(
        "funding_attribution",
        Text(),
        doc="Texto de atribución de financiamiento (como se debe citar a financiadores).",
    )
    fundingAttributionID: Mapped[Optional[String]] = mapped_column(
        "funding_attribution_id",
        String(255),
        doc="ID o código del registro de financiamiento (contrato, grant ID, etc.).",
    )

    # ---- Location opcionales ----
    countryCode: Mapped[Optional[String]] = mapped_column(
        "country_code",
        String(10),
        doc="DwC countryCode: código ISO 3166-1 alfa-2 (p.ej. 'PE') (opcional).",
    )
    minimumElevationInMeters: Mapped[Optional[Float]] = mapped_column(
        "minimum_elevation_in_meters",
        Float,
        doc="DwC minimumElevationInMeters: elevación mínima en metros (opcional).",
    )
    maximumElevationInMeters: Mapped[Optional[Float]] = mapped_column(
        "maximum_elevation_in_meters",
        Float,
        doc="DwC maximumElevationInMeters: elevación máxima en metros (opcional).",
    )
    verbatimCoordinateSystem: Mapped[Optional[String]] = mapped_column(
        "verbatim_coordinate_system",
        String(100),
        doc="DwC verbatimCoordinateSystem: sistema de coordenadas tal como se reportó (opcional).",
    )
    hydrographicContext: Mapped[Optional[str]] = mapped_column(
        "hydrographic_context",
        String(150),
        doc=(
            "Contexto hidrográfico asociado a la localidad: cuerpo de agua, "
            "archipiélago o isla específica (campo unificado del DwC: waterBody, islandGroup, island)."
        ),
    )
    footprintWKT: Mapped[Optional[Text]] = mapped_column(
        "footprint_wkt",
        Text(),
        doc="DwC footprintWKT: polígono/área de la ocurrencia en WKT (opcional).",
    )

    # Trazabilidad de creación / modificación
    createdAt: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    updatedAt: Mapped[datetime] = mapped_column(
        "updated_at",
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # ------------------------------------------------------------------
    # Relaciones (Collection, Agents, User, Identification)
    # ------------------------------------------------------------------

    collectionId: Mapped[Optional[int]] = mapped_column(
        "collection_id", ForeignKey("collection.id")
    )
    collection: Mapped[Optional["Collection"]] = relationship(
        "Collection", back_populates="occurrences"
    )

    # Colectores de campo (uno o varios Agent)
    agents: Mapped[List["Agent"]] = relationship(
        "Agent",
        secondary="occurrence_agent",
        back_populates="occurrences",
        lazy="selectin",
    )

    # Usuario que digitalizó la ocurrencia
    digitizerUserId: Mapped[Optional[int]] = mapped_column(
        "digitizer_user_id",
        ForeignKey("users.id"),
        nullable=True,
        index=True,
        doc="Usuario del sistema que digitalizó esta ocurrencia.",
    )
    digitizerUser: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="occurrencesDigitized",
        foreign_keys=[digitizerUserId],
    )

    # Historial de identificaciones taxonómicas
    identifications: Mapped[List["Identification"]] = relationship(
        "Identification",
        back_populates="occurrence",
        cascade="all, delete-orphan",
        passive_deletes=True,
        foreign_keys=lambda: [Identification.occurrenceId],
        primaryjoin=lambda: Occurrence.id == Identification.occurrenceId,
    )

    # Identificación vigente
    currentIdentificationId: Mapped[Optional[int]] = mapped_column(
        "current_identification_id",
        ForeignKey("identification.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc=(
            "FK a la Identification que se considera vigente para esta ocurrencia. "
            "Debe ser coherente con Identification.isCurrent = true."
        ),
    )
    currentIdentification: Mapped[Optional["Identification"]] = relationship(
        "Identification",
        foreign_keys=lambda: [Occurrence.currentIdentificationId],
        primaryjoin=lambda: Occurrence.currentIdentificationId == Identification.id,
        lazy="joined",
        post_update=True,
    )

    # Imágenes asociadas a la ocurrencia
    images: Mapped[List["OccurrenceImage"]] = relationship(
        "OccurrenceImage",
        back_populates="occurrence",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # __table_args__ = (
    #     UniqueConstraint(
    #         "collection_id",
    #         "catalog_number",
    #         name="uq_occurrence_collection_catalog",
    #     ),
    # )


class OccurrenceAgent(Base):
    """
    Tabla de enlace muchos-a-muchos entre Occurrence y Agent
    (colectores de una ocurrencia).
    """

    __tablename__ = "occurrence_agent"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    occurrenceId: Mapped[int] = mapped_column(
        "occurrence_id",
        ForeignKey("occurrence.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    agentId: Mapped[int] = mapped_column(
        "agent_id",
        ForeignKey("agent.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    agentOrder: Mapped[Optional[int]] = mapped_column(
        "agent_order",
        Integer,
        doc="Orden de aparición en la cita de colectores (1 = primero).",
    )

    __table_args__ = (
        UniqueConstraint(
            "occurrence_id",
            "agent_id",
            name="uq_occurrence_agent",
        ),
    )


class Identifier(Base):
    """
    Persona que se dedica a identificar especímenes (asociar taxonId-occurrenceId).
    Desacoplado de User (cuentas del sistema) y de Agent (colectores de campo).
    """

    __tablename__ = "identifier"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    fullName: Mapped[Optional[String]] = mapped_column("full_name", String(255))
    orcID: Mapped[Optional[String]] = mapped_column(
        "identifier_id",
        String(255),
        unique=True,
        nullable=True,
        doc="Identificador estable del identificador (URI/UUID interno/externo).",
    )  # p.ej. ORCID

    # Identificaciones en las que participa esta persona (muchos-a-muchos)
    identifications: Mapped[List["Identification"]] = relationship(
        "Identification",
        secondary="identification_identifier",
        back_populates="identifiers",
        lazy="selectin",
    )


class Identification(Base):
    """
    DwC Identification (versión mínima):
    - Quién identificó (Identifier + identifiedBy texto)
    - Cuándo
    - A qué taxón
    - Si es la identificación vigente
    - Si fue verificada
    - typeStatus (si el ejemplar es tipo)
    """

    __tablename__ = "identification"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ------------------------------
    # Vínculos básicos
    # ------------------------------
    occurrenceId: Mapped[int] = mapped_column(
        "occurrence_id",
        ForeignKey("occurrence.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="FK a Occurrence: registro al que se aplica esta identificación.",
    )
    occurrence: Mapped["Occurrence"] = relationship(
        "Occurrence",
        back_populates="identifications",
        foreign_keys=lambda: [Identification.occurrenceId],
        primaryjoin=lambda: Identification.occurrenceId == Occurrence.id,
    )

    taxonId: Mapped[Optional[int]] = mapped_column(
        "taxon_id",
        ForeignKey("taxon.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
        doc=(
            "FK al taxón asignado en esta identificación según el backbone. "
            "Puede ser NULL si aún no se ha resuelto o hay ambigüedad."
        ),
    )
    taxon: Mapped[Optional["Taxon"]] = relationship(
        "Taxon",
        back_populates="identifications",
    )

    # Personas que identifican (uno o varios Identifier)
    identifiers: Mapped[List["Identifier"]] = relationship(
        "Identifier",
        secondary="identification_identifier",
        back_populates="identifications",
        lazy="selectin",
    )

    # El campo que se llenó en la etiqueta
    # A veces no se puede asociar un taxonId automáticamente
    # Se debe verificar manualmente para asociar un taxonId
    scientificName: Mapped[Optional[str]] = mapped_column(
        "scientific_name",
        String(500),
        doc=(
            "Nombre científico asignado en esta identificación, tal como lo usa el identificador "
            "(puede no coincidir 1:1 con Taxon.scientificName)."
        ),
    )
    scientificNameAuthorship: Mapped[Optional[str]] = mapped_column(
        "scientific_name_authorship",
        String(255),
        doc="Autoría del nombre científico en esta identificación.",
    )

    # ------------------------------
    # Campos DwC esenciales
    # ------------------------------
    identifiedBy: Mapped[Optional[String]] = mapped_column(
        "identified_by",
        String(255),
        doc="DwC identifiedBy: quién(es) identificaron el espécimen (texto libre tal como en la etiqueta).",
    )

    dateIdentified: Mapped[Optional[String]] = mapped_column(
        "date_identified",
        String(100),
        doc="DwC dateIdentified: fecha o rango de fechas de identificación (ISO8601 o formato de etiqueta).",
    )

    # ¿Es la identificación vigente para la ocurrencia?
    isCurrent: Mapped[bool] = mapped_column(
        "is_current",
        Boolean,
        nullable=False,
        default=True,
        index=True,
        doc="True si esta es la identificación actualmente aceptada para la ocurrencia.",
    )

    # ¿Está verificada/revisada?
    isVerified: Mapped[bool] = mapped_column(
        "is_verified",
        Boolean,
        nullable=False,
        default=False,
        doc="True si la identificación ha sido verificada/revisada por un especialista.",
    )

    # Estado de tipo nomenclatural
    typeStatus: Mapped[Optional[String]] = mapped_column(
        "type_status",
        String(100),
        doc="DwC typeStatus: holotype, isotype, paratype, etc., si aplica.",
    )

    # Trazabilidad mínima
    createdAt: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    updatedAt: Mapped[datetime] = mapped_column(
        "updated_at",
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class IdentificationIdentifier(Base):
    """
    Tabla de enlace muchos-a-muchos entre Identification e Identifier
    (co-identificadores de una determinación taxonómica).
    """

    __tablename__ = "identification_identifier"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    identificationId: Mapped[int] = mapped_column(
        "identification_id",
        ForeignKey("identification.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    identifierId: Mapped[int] = mapped_column(
        "identifier_id",
        ForeignKey("identifier.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    identifierOrder: Mapped[Optional[int]] = mapped_column(
        "identifier_order",
        Integer,
        doc="Orden de aparición en la cita de identificadores.",
    )

    __table_args__ = (
        UniqueConstraint(
            "identification_id",
            "identifier_id",
            name="uq_identification_identifier",
        ),
    )


class OccurrenceImage(Base):
    """
    Imagen asociada a una ocurrencia.
    Guarda solo lo esencial:
    - path al archivo en disco/S3/etc.
    - tamaño del archivo
    - nombre de la persona que tomó la foto
    - orden dentro de la ocurrencia
    - trazabilidad mínima (created_at, updated_at)
    """

    __tablename__ = "occurrence_image"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ------------------------------
    # Vínculo a Occurrence
    # ------------------------------
    occurrenceId: Mapped[int] = mapped_column(
        "occurrence_id",
        ForeignKey("occurrence.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="FK a Occurrence: registro al que pertenece esta imagen.",
    )

    occurrence: Mapped["Occurrence"] = relationship(
        "Occurrence",
        back_populates="images",
    )

    # ------------------------------
    # Datos básicos de la imagen
    # ------------------------------
    imagePath: Mapped[str] = mapped_column(
        "image_path",
        String(1024),
        nullable=False,
        doc="Ruta o path al archivo de imagen.",
    )

    fileSize: Mapped[Optional[int]] = mapped_column(
        "file_size",
        Integer,
        doc="Tamaño del archivo en bytes (opcional).",
    )

    photographer: Mapped[Optional[str]] = mapped_column(
        "photographer",
        String(255),
        doc="Nombre de la persona que tomó la foto (opcional).",
    )

    # ------------------------------
    # Trazabilidad
    # ------------------------------
    createdAt: Mapped[datetime] = mapped_column(
        "created_at",
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    updatedAt: Mapped[datetime] = mapped_column(
        "updated_at",
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


Index("ix_identification_occurrence_current", Identification.occurrenceId, Identification.isCurrent)
Index("ix_occurrence_latlon", Occurrence.decimalLatitude, Occurrence.decimalLongitude)
Index("ix_occurrence_catalog", Occurrence.catalogNumber, Occurrence.collectionId)
Index("ix_occurrence_event_date", Occurrence.year, Occurrence.month, Occurrence.day)
Index("ix_taxon_name_auth_rank", Taxon.scientificName, Taxon.scientificNameAuthorship, Taxon.taxonRank)

Index(
    "ix_taxon_family_unaccent",
    func.unaccent_immutable(func.lower(Taxon.family)),
)

Index(
    "ix_institution_name_unaccent",
    func.unaccent_immutable(func.lower(Institution.institutionName)),
)

Index(
    "ix_occurrence_recordedby_unaccent",
    func.unaccent_immutable(func.lower(Occurrence.recordedBy)),
)

Index(
    "ix_occurrence_location_unaccent",
    func.unaccent_immutable(
        func.lower(
            func.coalesce(
                Occurrence.locality,
                Occurrence.municipality,
                Occurrence.stateProvince,
                Occurrence.country,
            )
        )
    ),
)
