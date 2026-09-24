"""Modelo de referencia: países del catálogo de divisiones administrativas.

La tabla `country` se deriva de las fuentes sembradas (INEI para Perú,
GeoNames para el resto) y es la única lista de países que consume la UI.
"""

from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.config.database import Base


class Country(Base):
    __tablename__ = "country"

    # Código ISO 3166-1 alfa-2 (p.ej. 'PE')
    code: Mapped[str] = mapped_column("code", String(2), primary_key=True)
    name: Mapped[str] = mapped_column("name", String(100), nullable=False)
    # Fuente del catálogo: 'INEI' | 'GEONAMES'
    source: Mapped[str] = mapped_column("source", String(20), nullable=False)
    # Niveles administrativos disponibles en el catálogo (PE: 3, resto: 2)
    adminLevels: Mapped[int] = mapped_column("admin_levels", Integer, nullable=False, default=2)
