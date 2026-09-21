# backend/services/occurrence_filters.py

from datetime import date
from typing import Optional

from fastapi import Depends, HTTPException, Query, status
from geoalchemy2 import Geography, Geometry
from sqlalchemy import Select, and_, cast, func, or_
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.models.models import Institution, Occurrence, Taxon
from backend.schemas.occurrence import OccurrenceFilters
from backend.services.geometry import InvalidPolygon, check_simple_polygon


def get_occurrence_filters(
    code: Optional[str] = Query(None),
    scientific_name: Optional[str] = Query(None, alias="scientificName"),
    family: Optional[str] = Query(None),
    institution: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    collector: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None, alias="dateFrom"),
    date_to: Optional[date] = Query(None, alias="dateTo"),
    collection_id: Optional[int] = Query(None, alias="collectionId"),
    institution_id: Optional[int] = Query(None, alias="institutionId"),
    near_lat: Optional[float] = Query(None, alias="nearLat", ge=-90, le=90),
    near_lon: Optional[float] = Query(None, alias="nearLon", ge=-180, le=180),
    radius_km: Optional[float] = Query(None, alias="radiusKm", gt=0),
    within_polygon: Optional[str] = Query(None, alias="withinPolygon"),
    db: Session = Depends(get_db),
) -> OccurrenceFilters:
    radius_search_fields = (near_lat, near_lon, radius_km)
    if any(v is not None for v in radius_search_fields) and not all(
        v is not None for v in radius_search_fields
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Para buscar por radio debes enviar nearLat, nearLon y radiusKm juntos.",
        )

    if within_polygon:
        try:
            check_simple_polygon(db, within_polygon)
        except InvalidPolygon as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=f"withinPolygon inválido: {e}."
            )

    return OccurrenceFilters(
        code=code,
        scientific_name=scientific_name,
        family=family,
        institution=institution,
        location=location,
        collector=collector,
        date_from=date_from,
        date_to=date_to,
        collection_id=collection_id,
        institution_id=institution_id,
        near_lat=near_lat,
        near_lon=near_lon,
        radius_km=radius_km,
        within_polygon=within_polygon,
    )


def _like_unaccent(expr, term: str, *, mode: str = "contains"):
    """
    Genera una condición acento-insensible usando unaccent_immutable + lower.

    mode:
      - "contains" -> %term%
      - "prefix"   -> term%
      - "exact"    -> term
    """
    term = term.strip()
    if not term:
        return None

    if mode == "contains":
        pattern = f"%{term}%"
    elif mode == "prefix":
        pattern = f"{term}%"
    else:  # exact
        pattern = term

    # Debe coincidir con la expresión de los índices:
    #   unaccent_immutable(lower(columna))
    return func.unaccent_immutable(func.lower(expr)).like(
        func.unaccent_immutable(func.lower(pattern))
    )


def build_geo_condition(f: OccurrenceFilters):
    """Condición espacial del filtro, o None si no hay área. Una muestra coincide si su
    ubicación (punto, círculo de incertidumbre o polígono) toca el área. Radio y
    polígono juntos se combinan con AND."""
    areas = []

    # `location` es geography: ST_DWithin mide en metros reales.
    if f.near_lat is not None and f.near_lon is not None and f.radius_km is not None:
        origin = cast(
            func.ST_SetSRID(func.ST_MakePoint(f.near_lon, f.near_lat), 4326),
            Geography(geometry_type="POINT", srid=4326),
        )
        meters = f.radius_km * 1000.0
        areas.append(
            or_(
                func.ST_DWithin(Occurrence.location, origin, meters),
                func.ST_DWithin(
                    cast(Occurrence.footprintGeom, Geography(srid=4326)), origin, meters
                ),
            )
        )

    # ST_Contains necesita geometry, de ahí el cast de `location`.
    if f.within_polygon:
        polygon = func.ST_GeomFromText(f.within_polygon, 4326)
        areas.append(
            or_(
                func.ST_Contains(
                    polygon, cast(Occurrence.location, Geometry(geometry_type="POINT", srid=4326))
                ),
                func.ST_Intersects(Occurrence.footprintGeom, polygon),
            )
        )

    return and_(*areas) if areas else None


def apply_occurrence_filters(stmt: Select, filters: OccurrenceFilters) -> Select:
    f = filters

    # mismas expresiones que usas en el endpoint
    code_expr = func.coalesce(Occurrence.catalogNumber, Occurrence.recordNumber)
    location_expr = func.coalesce(
        Occurrence.locality,
        Occurrence.municipality,
        Occurrence.stateProvince,
        Occurrence.country,
    )

    # Código exacto (normalmente sin tildes, lo dejamos simple)
    if f.code:
        term = f.code.strip()
        if term:
            stmt = stmt.where(code_expr == term)

    # Nombre científico (prefijo, acento-insensible) -> Taxon.scientificName
    if f.scientific_name:
        cond = _like_unaccent(
            Taxon.scientificName,
            f.scientific_name,
            mode="prefix",
        )
        if cond is not None:
            stmt = stmt.where(cond)

    # Familia (prefijo, acento-insensible) -> Taxon.family
    if f.family:
        cond = _like_unaccent(
            Taxon.family,
            f.family,
            mode="prefix",
        )
        if cond is not None:
            stmt = stmt.where(cond)

    # Institución (contiene, acento-insensible) -> Institution.institutionName
    if f.institution:
        cond = _like_unaccent(
            Institution.institutionName,
            f.institution,
            mode="contains",
        )
        if cond is not None:
            stmt = stmt.where(cond)

    # Localidad (contiene, acento-insensible) -> location_expr (coalesce)
    if f.location:
        cond = _like_unaccent(
            location_expr,
            f.location,
            mode="contains",
        )
        if cond is not None:
            stmt = stmt.where(cond)

    # Colector (contiene, acento-insensible) -> Occurrence.recordedBy
    if f.collector:
        cond = _like_unaccent(
            Occurrence.recordedBy,
            f.collector,
            mode="contains",
        )
        if cond is not None:
            stmt = stmt.where(cond)

    if f.date_from or f.date_to:
        stmt = stmt.where(Occurrence.eventDate.op("~")(r"^\d{4}-\d{2}-\d{2}"))
        event_day = func.left(Occurrence.eventDate, 10)
        if f.date_from:
            stmt = stmt.where(event_day >= f.date_from.isoformat())
        if f.date_to:
            stmt = stmt.where(event_day <= f.date_to.isoformat())

    if f.collection_id is not None:
        stmt = stmt.where(Occurrence.collectionId == f.collection_id)

    if f.institution_id is not None:
        stmt = stmt.where(Institution.id == f.institution_id)

    geo_condition = build_geo_condition(f)
    if geo_condition is not None:
        stmt = stmt.where(geo_condition)

    return stmt
