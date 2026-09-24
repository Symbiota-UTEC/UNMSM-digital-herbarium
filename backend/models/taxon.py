"""Modelo DwC: Taxon (backbone WFO / Flora)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import List, Optional

from sqlalchemy import Boolean, Date, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.config.database import Base


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
    scientificNameID: Mapped[Optional[str]] = mapped_column("scientific_name_id", String(255))
    localID: Mapped[Optional[str]] = mapped_column("local_id", String(255))
    scientificName: Mapped[Optional[str]] = mapped_column(
        "scientific_name", String(500), index=True
    )
    taxonRank: Mapped[Optional[str]] = mapped_column("taxon_rank", String(50))
    parentNameUsageID: Mapped[Optional[str]] = mapped_column("parent_name_usage_id", String(255))

    scientificNameAuthorship: Mapped[Optional[str]] = mapped_column(
        "scientific_name_authorship", String(255)
    )
    family: Mapped[Optional[str]] = mapped_column("family", String(100))
    subfamily: Mapped[Optional[str]] = mapped_column("subfamily", String(100))
    tribe: Mapped[Optional[str]] = mapped_column("tribe", String(100))
    subtribe: Mapped[Optional[str]] = mapped_column("subtribe", String(100))
    genus: Mapped[Optional[str]] = mapped_column("genus", String(100))
    subgenus: Mapped[Optional[str]] = mapped_column("subgenus", String(100))
    specificEpithet: Mapped[Optional[str]] = mapped_column("specific_epithet", String(100))
    infraspecificEpithet: Mapped[Optional[str]] = mapped_column(
        "infraspecific_epithet", String(100)
    )
    verbatimTaxonRank: Mapped[Optional[str]] = mapped_column("verbatim_taxon_rank", String(50))
    nomenclaturalStatus: Mapped[Optional[str]] = mapped_column("nomenclatural_status", String(100))

    namePublishedIn: Mapped[Optional[str]] = mapped_column("name_published_in", String(500))
    taxonomicStatus: Mapped[Optional[str]] = mapped_column("taxonomic_status", String(100))
    acceptedNameUsageID: Mapped[Optional[str]] = mapped_column(
        "accepted_name_usage_id", String(255)
    )
    originalNameUsageID: Mapped[Optional[str]] = mapped_column(
        "original_name_usage_id", String(255)
    )
    nameAccordingToID: Mapped[Optional[str]] = mapped_column("name_according_to_id", String(255))
    taxonRemarks: Mapped[Optional[str]] = mapped_column("taxon_remarks", Text())

    created: Mapped[Optional[date]] = mapped_column("created", Date)
    modified: Mapped[Optional[date]] = mapped_column("modified", Date)

    # Flora fields
    references: Mapped[Optional[str]] = mapped_column("references", Text())
    source: Mapped[Optional[str]] = mapped_column("source", String(255))
    majorGroup: Mapped[Optional[str]] = mapped_column("major_group", String(100))
    tplID: Mapped[Optional[str]] = mapped_column("tpl_id", String(100))

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
