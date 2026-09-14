"""Modelos DwC: Identification e Identifier."""
from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.config.database import Base
from backend.models.occurrence import Occurrence
from datetime import datetime


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
