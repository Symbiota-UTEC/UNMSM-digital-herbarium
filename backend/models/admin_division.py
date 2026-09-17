"""Modelo de referencia: divisiones administrativas (jerarquía DwC Location).

Nivel 1 = departamento/región (dwc:stateProvince), nivel 2 = provincia
(dwc:county), nivel 3 = distrito (dwc:municipality). Perú proviene del
catálogo INEI (ubigeo); los demás países de GeoNames (ADM1/ADM2).
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.config.database import Base


class AdminDivision(Base):
    __tablename__ = "admin_division"
    __table_args__ = (
        UniqueConstraint(
            "country_code", "level", "code",
            name="uq_admin_division_country_level_code",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        "id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    countryCode: Mapped[str] = mapped_column(
        "country_code", String(2), nullable=False, index=True
    )
    level: Mapped[int] = mapped_column("level", Integer, nullable=False)
    # Ubigeo (PE) o código GeoNames (p.ej. 'PE.15')
    code: Mapped[str] = mapped_column("code", String(20), nullable=False)
    name: Mapped[str] = mapped_column("name", String(100), nullable=False)
    # Nombre en minúsculas y sin tildes, para búsqueda y matching
    normalizedName: Mapped[str] = mapped_column(
        "normalized_name", String(100), nullable=False, index=True
    )
    parentId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "parent_id",
        ForeignKey(
            "admin_division.id",
            use_alter=True,
            name="fk_admin_division_parent",
        ),
        nullable=True,
        index=True,
    )
    # Fuente del registro: 'INEI' | 'GEONAMES'
    source: Mapped[str] = mapped_column("source", String(20), nullable=False)
    # Identificador en la fuente (ubigeo o id numérico de GeoNames)
    sourceId: Mapped[Optional[str]] = mapped_column("source_id", String(20))

    parent: Mapped[Optional["AdminDivision"]] = relationship(
        "AdminDivision", remote_side=[id], lazy="select"
    )
