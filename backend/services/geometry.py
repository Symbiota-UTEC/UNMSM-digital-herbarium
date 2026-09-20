# backend/services/geometry.py
import re

from sqlalchemy import func, select
from sqlalchemy.exc import DataError, InternalError
from sqlalchemy.orm import Session

_POLYGON_RE = re.compile(r"\s*POLYGON\b", re.IGNORECASE)


class InvalidPolygon(ValueError):
    """WKT que no es un único POLYGON simple; el mensaje está pensado para el usuario."""


def check_simple_polygon(db: Session, wkt: str) -> None:
    """Exige un único POLYGON simple: sin autointersecciones ni huecos. Puede ser
    cóncavo. La validez la decide PostGIS (ST_IsValid), así que es la misma regla para
    footprintWKT y para el polígono de búsqueda."""
    if not _POLYGON_RE.match(wkt):
        raise InvalidPolygon("solo se admite un POLYGON (no MULTIPOLYGON ni otras formas)")

    geom = func.ST_GeomFromText(wkt, 4326)
    try:
        valid, reason, empty, holes = db.execute(
            select(
                func.ST_IsValid(geom),
                func.ST_IsValidReason(geom),
                func.ST_IsEmpty(geom),
                func.ST_NumInteriorRings(geom),
            )
        ).one()
    except (DataError, InternalError):
        db.rollback()
        raise InvalidPolygon("no es un WKT válido, p. ej. POLYGON((-77.05 -12.04, -77.03 -12.04, -77.03 -12.06, -77.05 -12.04))")

    if empty:
        raise InvalidPolygon("el polígono está vacío")
    if not valid:
        raise InvalidPolygon(
            "el polígono no puede cruzarse consigo mismo" if "Self-intersection" in reason else reason
        )
    if holes:
        raise InvalidPolygon("el polígono no admite huecos")
