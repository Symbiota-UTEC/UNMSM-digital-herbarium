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

import uuid
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
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

from backend.config.database import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, date


class Institution(Base):
    __tablename__ = "institution"

    institutionId: Mapped[uuid.UUID] = mapped_column(
        "institution_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    institutionName: Mapped[Optional[str]] = mapped_column(
        "institution_name", String(255)
    )
    country: Mapped[Optional[str]] = mapped_column("country", String(100))
    city: Mapped[Optional[str]] = mapped_column("city", String(100))
    address: Mapped[Optional[str]] = mapped_column("address", Text())
    email: Mapped[Optional[str]] = mapped_column("email", String(255))
    phone: Mapped[Optional[str]] = mapped_column("phone", String(50))
    webSite: Mapped[Optional[str]] = mapped_column("web_site", String(255))

    institutionAdminUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "institution_admin_user_id",
        ForeignKey(
            "users.user_id", 
            use_alter=True,
            name="fk_institution_admin_user"
        ),
        nullable=True,
        unique=True,
    )
    institutionAdminUser: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[institutionAdminUserId],
        lazy="joined",
        post_update=True,
    )

    usersCount: Mapped[int] = mapped_column(
        "users_count", Integer, default=0, nullable=False
    )
    users: Mapped[List["User"]] = relationship(
        "User",
        back_populates="institution",
        foreign_keys="[User.institutionId]",
        primaryjoin="User.institutionId == Institution.institutionId",
        cascade="all, delete-orphan",
        passive_deletes=False,
    )

    collections: Mapped[List["Collection"]] = relationship(
        "Collection", back_populates="institution"
    )


class Collection(Base):
    """Colección física o virtual que alberga especímenes/registros."""

    __tablename__ = "collection"

    collectionId: Mapped[uuid.UUID] = mapped_column(
        "collection_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collectionName: Mapped[Optional[str]] = mapped_column(
        "collection_name", String(255)
    )
    description: Mapped[Optional[str]] = mapped_column("description", Text())

    institutionId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "institution_id", ForeignKey("institution.institution_id")
    )
    institution: Mapped[Optional["Institution"]] = relationship(
        "Institution", back_populates="collections"
    )

    # El creador es un User, no un Agent
    creatorUserId: Mapped[uuid.UUID] = mapped_column(
        "creator_user_id",
        ForeignKey("users.user_id", ondelete="RESTRICT"),
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


class User(Base):
    __tablename__ = "users"

    userId: Mapped[uuid.UUID] = mapped_column(
        "user_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
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
    givenName: Mapped[Optional[str]] = mapped_column("given_name", String(100))
    familyName: Mapped[Optional[str]] = mapped_column("family_name", String(100))
    fullName: Mapped[Optional[str]] = mapped_column("full_name", String(255))
    orcid: Mapped[Optional[str]] = mapped_column("orcid", String(50))
    phone: Mapped[Optional[str]] = mapped_column("phone", String(50))
    address: Mapped[Optional[str]] = mapped_column("address", Text())

    # Importante: User y Agent están desacoplados (no hay agentId aquí)

    institutionId: Mapped[uuid.UUID] = mapped_column(
        "institution_id",
        ForeignKey("institution.institution_id"),
        nullable=False,
        index=True,
    )
    institution: Mapped["Institution"] = relationship(
        "Institution",
        back_populates="users",
        foreign_keys=[institutionId],
        primaryjoin="User.institutionId == Institution.institutionId",
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

    collectionPermissionId: Mapped[uuid.UUID] = mapped_column(
        "collection_permission_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collectionId: Mapped[uuid.UUID] = mapped_column(
        "collection_id",
        ForeignKey("collection.collection_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    userId: Mapped[uuid.UUID] = mapped_column(
        "user_id",
        ForeignKey("users.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        "role",
        Enum("viewer", "editor", "owner", name="collection_permission_enum"),
        nullable=False,
        index=True,
    )
    grantedByUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "granted_by_user_id", ForeignKey("users.user_id"), nullable=True
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

    registrationRequestId: Mapped[uuid.UUID] = mapped_column(
        "registration_request_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Datos de acceso solicitados
    username: Mapped[str] = mapped_column("username", String(100), index=True)
    email: Mapped[str] = mapped_column("email", String(255), index=True)
    hashedPassword: Mapped[str] = mapped_column("hashed_password", String(255))

    # Institución
    institutionId: Mapped[uuid.UUID] = mapped_column(
        "institution_id", ForeignKey("institution.institution_id"), nullable=False
    )
    institution: Mapped["Institution"] = relationship("Institution")

    # Curador (datos personales solicitados)
    fullName: Mapped[Optional[str]] = mapped_column("full_name", String(255))
    givenName: Mapped[Optional[str]] = mapped_column("given_name", String(100))
    familyName: Mapped[Optional[str]] = mapped_column("family_name", String(100))
    orcid: Mapped[Optional[str]] = mapped_column("orcid", String(50))
    phone: Mapped[Optional[str]] = mapped_column("phone", String(50))
    address: Mapped[Optional[str]] = mapped_column("address", Text())

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

    reviewedByUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "reviewed_by_user_id", ForeignKey("users.user_id"), nullable=True
    )
    reviewedBy: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[reviewedByUserId]
    )

    resultingUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "resulting_user_id", ForeignKey("users.user_id"), nullable=True, unique=True
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

    taxonId: Mapped[uuid.UUID] = mapped_column(
        "taxon_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Identificador externo del backbone WFO (p.ej. "wfo-xxxxxxxx")
    wfoTaxonId: Mapped[Optional[str]] = mapped_column(
        "wfo_taxon_id", String(255), unique=True, index=True
    )
    scientificNameID: Mapped[Optional[str]] = mapped_column(
        "scientific_name_id", String(255)
    )
    localID: Mapped[Optional[str]] = mapped_column(
        "local_id", String(255)
    )
    scientificName: Mapped[Optional[str]] = mapped_column(
        "scientific_name", String(500), index=True
    )
    taxonRank: Mapped[Optional[str]] = mapped_column(
        "taxon_rank", String(50)
    )
    parentNameUsageID: Mapped[Optional[str]] = mapped_column(
        "parent_name_usage_id", String(255)
    )

    scientificNameAuthorship: Mapped[Optional[str]] = mapped_column(
        "scientific_name_authorship", String(255)
    )
    family: Mapped[Optional[str]] = mapped_column(
        "family", String(100)
    )
    subfamily: Mapped[Optional[str]] = mapped_column(
        "subfamily", String(100)
    )
    tribe: Mapped[Optional[str]] = mapped_column(
        "tribe", String(100)
    )
    subtribe: Mapped[Optional[str]] = mapped_column(
        "subtribe", String(100)
    )
    genus: Mapped[Optional[str]] = mapped_column(
        "genus", String(100)
    )
    subgenus: Mapped[Optional[str]] = mapped_column(
        "subgenus", String(100)
    )
    specificEpithet: Mapped[Optional[str]] = mapped_column(
        "specific_epithet", String(100)
    )
    infraspecificEpithet: Mapped[Optional[str]] = mapped_column(
        "infraspecific_epithet", String(100)
    )
    verbatimTaxonRank: Mapped[Optional[str]] = mapped_column(
        "verbatim_taxon_rank", String(50)
    )
    nomenclaturalStatus: Mapped[Optional[str]] = mapped_column(
        "nomenclatural_status", String(100)
    )

    namePublishedIn: Mapped[Optional[str]] = mapped_column(
        "name_published_in", String(500)
    )
    taxonomicStatus: Mapped[Optional[str]] = mapped_column(
        "taxonomic_status", String(100)
    )
    acceptedNameUsageID: Mapped[Optional[str]] = mapped_column(
        "accepted_name_usage_id", String(255)
    )
    originalNameUsageID: Mapped[Optional[str]] = mapped_column(
        "original_name_usage_id", String(255)
    )
    nameAccordingToID: Mapped[Optional[str]] = mapped_column(
        "name_according_to_id", String(255)
    )
    taxonRemarks: Mapped[Optional[str]] = mapped_column(
        "taxon_remarks", Text()
    )

    created: Mapped[Optional[date]] = mapped_column("created", Date)
    modified: Mapped[Optional[date]] = mapped_column("modified", Date)

    # Flora fields
    references: Mapped[Optional[str]] = mapped_column(
        "references", Text()
    )
    source: Mapped[Optional[str]] = mapped_column(
        "source", String(255)
    )
    majorGroup: Mapped[Optional[str]] = mapped_column(
        "major_group", String(100)
    )
    tplID: Mapped[Optional[str]] = mapped_column(
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

    occurrenceId: Mapped[uuid.UUID] = mapped_column(
        "occurrence_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------------------------------------------
    # OBLIGATORIOS (Occurrence + Event + Location)
    # ------------------------------------------------------------------

    # ---- Occurrence core ----
    recordNumber: Mapped[Optional[str]] = mapped_column(
        "record_number",
        String(100),
        doc="DwC recordNumber: número / código de colecta asignado por el colector.",
    )
    recordedBy: Mapped[Optional[str]] = mapped_column(
        "recorded_by",
        String(255),
        doc="DwC recordedBy: nombres de colectores, en orden de importancia.",
    )
    catalogNumber: Mapped[Optional[str]] = mapped_column(
        "catalog_number",
        String(100),
        index=True,
        doc="DwC catalogNumber: identificador dentro de la colección (número de pliego, etc.).",
    )

    # ---- Event mínimo ----
    verbatimEventDate: Mapped[Optional[str]] = mapped_column(
        "verbatim_event_date",
        String(100),
        doc="DwC verbatimEventDate: fecha del evento tal como aparece en la etiqueta.",
    )

    # ---- Location mínimos (según tu tabla: OBLIGATORIOS) ----
    country: Mapped[Optional[str]] = mapped_column(
        "country",
        String(100),
        doc="DwC country: nombre del país (p.ej. 'Peru').",
    )
    stateProvince: Mapped[Optional[str]] = mapped_column(
        "state_province",
        String(100),
        doc="DwC stateProvince: departamento/región.",
    )
    verbatimLocality: Mapped[Optional[str]] = mapped_column(
        "verbatim_locality",
        Text(),
        doc="DwC verbatimLocality: descripción textual tal como en la etiqueta (más informal/dinámico).",
    )

    # ------------------------------------------------------------------
    # DESEABLES (nice to have)
    # ------------------------------------------------------------------

    # ---- Occurrence deseable ----
    organismQuantity: Mapped[Optional[str]] = mapped_column(
        "organism_quantity",
        String(100),
        doc="DwC organismQuantity: cantidad de organismos (número o descriptor).",
    )
    organismQuantityType: Mapped[Optional[str]] = mapped_column(
        "organism_quantity_type",
        String(100),
        doc="DwC organismQuantityType: tipo de unidad (individuos, ramas, colonias, etc.).",
    )
    georeferenceVerificationStatus: Mapped[Optional[str]] = mapped_column(
        "georeference_verification_status",
        String(100),
        doc="DwC georeferenceVerificationStatus: estado de verificación de la georreferenciación.",
    )
    # ---- Event deseable ----
    eventDate: Mapped[Optional[str]] = mapped_column(
        "event_date",
        String(100),
        doc="DwC eventDate: fecha/rango ISO8601 normalizado del evento.",
    )
    habitat: Mapped[Optional[str]] = mapped_column(
        "habitat",
        Text(),
        doc="DwC habitat: descripción del hábitat.",
    )
    eventRemarks: Mapped[Optional[str]] = mapped_column(
        "event_remarks",
        Text(),
        doc="DwC eventRemarks: notas adicionales sobre el evento de muestreo.",
    )

    year: Mapped[Optional[int]] = mapped_column(
        "year",
        Integer,
        doc="Año del evento de colecta.",
    )
    month: Mapped[Optional[int]] = mapped_column(
        "month",
        Integer,
        doc="Mes del evento de colecta (1-12).",
    )
    day: Mapped[Optional[int]] = mapped_column(
        "day",
        Integer,
        doc="Día del mes del evento de colecta.",
    )

    # Location: deseable
    verbatimElevation: Mapped[Optional[str]] = mapped_column(
        "verbatim_elevation",
        String(100),
        doc="DwC verbatimElevation: elevación tal como en la etiqueta (con unidades, rangos, etc.).",
    )
    county: Mapped[Optional[str]] = mapped_column(
        "county",
        String(100),
        doc="DwC county: provincia (nice to have).",
    )
    municipality: Mapped[Optional[str]] = mapped_column(
        "municipality",
        String(100),
        doc="DwC municipality: distrito/municipio (nice to have).",
    )
    locality: Mapped[Optional[str]] = mapped_column(
        "locality",
        Text(),
        doc="DwC locality: localidad oficial (centro poblado, caserío, etc.) (nice to have).",
    )
    locationRemarks: Mapped[Optional[str]] = mapped_column(
        "location_remarks",
        Text(),
        doc="DwC locationRemarks: comentarios adicionales sobre la ubicación (nice to have).",
    )
    decimalLatitude: Mapped[Optional[float]] = mapped_column(
        "decimal_latitude",
        Float,
        index=True,
        doc="DwC decimalLatitude: latitud en grados decimales (WGS84) (nice to have).",
    )
    decimalLongitude: Mapped[Optional[float]] = mapped_column(
        "decimal_longitude",
        Float,
        index=True,
        doc="DwC decimalLongitude: longitud en grados decimales (WGS84) (nice to have).",
    )
    # OPCIONALES

    # ---- Occurrence opcionales ----
    occurrenceStatus: Mapped[Optional[str]] = mapped_column(
        "occurrence_status",
        String(100),
        doc="DwC occurrenceStatus: estado de la ocurrencia (Presente, Ausente, En préstamo, etc.).",
    )
    occurrenceRemarks: Mapped[Optional[str]] = mapped_column(
        "occurrence_remarks",
        Text(),
        doc="DwC occurrenceRemarks: notas sobre la ocurrencia (fenología, sustrato, microhábitat, etc.).",
    )
    lifeStage: Mapped[Optional[str]] = mapped_column(
        "life_stage",
        String(100),
        doc="DwC lifeStage: etapa de vida del organismo (plántula, adulto, flor, fruto, etc.).",
    )
    establishmentMeans: Mapped[Optional[str]] = mapped_column(
        "establishment_means",
        String(100),
        doc="DwC establishmentMeans: nativo, introducido, cultivado, etc.",
    )
    associatedReferences: Mapped[Optional[str]] = mapped_column(
        "associated_references",
        Text(),
        doc="DwC associatedReferences: referencias bibliográficas ligadas a esta ocurrencia.",
    )
    associatedTaxa: Mapped[Optional[str]] = mapped_column(
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
    fieldNotes: Mapped[Optional[str]] = mapped_column(
        "field_notes",
        Text(),
        doc="DwC fieldNotes: notas de campo tal como en la libreta.",
    )
    # ---- Location opcionales ----
    countryCode: Mapped[Optional[str]] = mapped_column(
        "country_code",
        String(10),
        doc="DwC countryCode: código ISO 3166-1 alfa-2 (p.ej. 'PE') (opcional).",
    )
    hydrographicContext: Mapped[Optional[str]] = mapped_column(
        "hydrographic_context",
        String(150),
        doc=(
            "Contexto hidrográfico asociado a la localidad: cuerpo de agua, "
            "archipiélago o isla específica (campo unificado del DwC: waterBody, islandGroup, island)."
        ),
    )
    footprintWKT: Mapped[Optional[str]] = mapped_column(
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

    collectionId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "collection_id", ForeignKey("collection.collection_id")
    )
    collection: Mapped[Optional["Collection"]] = relationship(
        "Collection", back_populates="occurrences"
    )

    # Usuario que digitalizó la ocurrencia
    digitizerUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "digitizer_user_id",
        ForeignKey("users.user_id"),
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
        primaryjoin=lambda: Occurrence.occurrenceId == Identification.occurrenceId,
    )

    # Identificación vigente
    currentIdentificationId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "current_identification_id",
        ForeignKey(
            "identification.identification_id", 
            ondelete="SET NULL",
            use_alter=True, # Rompe el ciclo en la creación/borrado
            name="fk_occurrence_current_id"
        ),
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
        primaryjoin=lambda: Occurrence.currentIdentificationId == Identification.identificationId,
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


class Identifier(Base):
    """
    Persona que identifica un espécimen en el contexto de una Identification concreta.
    Cada registro es una instancia de "esta persona participó en esta identificación".
    Desacoplado de User (cuentas del sistema) y de Agent (colectores de campo).
    """

    __tablename__ = "identifier"

    identifierId: Mapped[uuid.UUID] = mapped_column(
        "identifier_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    identificationId: Mapped[uuid.UUID] = mapped_column(
        "identification_id",
        ForeignKey("identification.identification_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    fullName: Mapped[Optional[str]] = mapped_column("full_name", String(255))
    orcID: Mapped[Optional[str]] = mapped_column(
        "orc_id",
        String(255),
        nullable=True,
        doc="ORCID u otro identificador estable del identificador.",
    )
    identification: Mapped["Identification"] = relationship(
        "Identification",
        back_populates="identifiers",
    )


class Identification(Base):
    """
    DwC Identification (versión mínima):
    - Quién identificó (lista de Identifier)
    - Cuándo
    - A qué taxón
    - Si es la identificación vigente
    - Si fue verificada
    - typeStatus (si el ejemplar es tipo)
    """

    __tablename__ = "identification"

    identificationId: Mapped[uuid.UUID] = mapped_column(
        "identification_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------
    # Vínculos básicos
    # ------------------------------
    occurrenceId: Mapped[uuid.UUID] = mapped_column(
        "occurrence_id",
        ForeignKey("occurrence.occurrence_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="FK a Occurrence: registro al que se aplica esta identificación.",
    )
    occurrence: Mapped["Occurrence"] = relationship(
        "Occurrence",
        back_populates="identifications",
        foreign_keys=lambda: [Identification.occurrenceId],
        primaryjoin=lambda: Identification.occurrenceId == Occurrence.occurrenceId,
    )

    taxonId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "taxon_id",
        ForeignKey("taxon.taxon_id", ondelete="RESTRICT"),
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

    # Personas que identificaron (uno o varios Identifier, relación directa)
    identifiers: Mapped[List["Identifier"]] = relationship(
        "Identifier",
        back_populates="identification",
        lazy="selectin",
        cascade="all, delete-orphan",
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
    dateIdentified: Mapped[Optional[str]] = mapped_column(
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
    typeStatus: Mapped[Optional[str]] = mapped_column(
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

    occurrenceImageId: Mapped[uuid.UUID] = mapped_column(
        "occurrence_image_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------
    # Vínculo a Occurrence
    # ------------------------------
    occurrenceId: Mapped[uuid.UUID] = mapped_column(
        "occurrence_id",
        ForeignKey("occurrence.occurrence_id", ondelete="CASCADE"),
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
