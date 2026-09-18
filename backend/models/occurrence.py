"""Modelos DwC: Occurrence (aplanado con Event + Location) y OccurrenceImage.

Occurrence <-> Identification se referencian mutuamente; para evitar un import
circular, las referencias a Identification se resuelven en funciones (SQLAlchemy
las llama recién al configurar los mappers, cuando ambos módulos ya cargaron).
"""
from __future__ import annotations

import uuid
from typing import List, Optional, Any

from sqlalchemy import String, Text, Integer, Float, DateTime, ForeignKey, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geography, Geometry

from backend.config.database import Base
from datetime import datetime


def _identification_occurrence_id_fk():
    from backend.models.identification import Identification
    return [Identification.occurrenceId]


def _occurrence_identifications_primaryjoin():
    from backend.models.identification import Identification
    return Occurrence.occurrenceId == Identification.occurrenceId


def _occurrence_current_identification_primaryjoin():
    from backend.models.identification import Identification
    return Occurrence.currentIdentificationId == Identification.identificationId


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
    # WKT (Well-Known Text): geometría como texto, p. ej. POLYGON((lon lat, lon lat, ...)); orden lon lat.
    footprintWKT: Mapped[Optional[str]] = mapped_column(
        "footprint_wkt",
        Text(),
        doc="DwC footprintWKT: polígono/área de la ocurrencia en WKT (opcional).",
    )

    # ---- Columnas espaciales (PostGIS) ----
    # services/occurrences.py lo deriva de decimalLatitude/decimalLongitude en cada create/update.
    location: Mapped[Optional[Any]] = mapped_column(
        "location",
        Geography(geometry_type="POINT", srid=4326),
        nullable=True,
        doc="Punto (WGS84) derivado de decimalLatitude/decimalLongitude, para búsquedas por radio.",
    )
    # services/occurrences.py lo deriva de footprintWKT en cada create/update.
    footprintGeom: Mapped[Optional[Any]] = mapped_column(
        "footprint_geom",
        Geometry(geometry_type="GEOMETRY", srid=4326),
        nullable=True,
        doc="POLYGON o MULTIPOLYGON (WGS84) derivado de footprintWKT; el tipo se valida en services/occurrences.py.",
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
        foreign_keys=_identification_occurrence_id_fk,
        primaryjoin=_occurrence_identifications_primaryjoin,
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
        primaryjoin=_occurrence_current_identification_primaryjoin,
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
