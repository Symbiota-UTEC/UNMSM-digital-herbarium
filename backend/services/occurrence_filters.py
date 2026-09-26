# backend/services/occurrence_filters.py

from datetime import date
from typing import Optional

from fastapi import Depends, HTTPException, Query, status
from geoalchemy2 import Geography, Geometry
from sqlalchemy import Boolean, Float, Select, and_, cast, func, null, or_
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.models.models import Institution, Occurrence, Taxon
from backend.schemas.occurrence import OccurrenceFilters, OccurrenceOrder, OccurrenceSort
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
    sort: Optional[OccurrenceSort] = Query(
        None,
        description=(
            "Un solo criterio: 'distance' (más cerca de nearLat/nearLon primero, requiere "
            "ambos), 'date', 'scientificName', 'family', 'collector', 'location' o 'institution'."
        ),
    ),
    order: Optional[OccurrenceOrder] = Query(
        None,
        description="'asc' o 'desc'; requiere sort. Sin él, cada sort usa su dirección por defecto.",
    ),
    db: Session = Depends(get_db),
) -> OccurrenceFilters:
    # nearLat/nearLon van siempre juntos. radiusKm además exige ambos (para el área); sin
    # radiusKm, nearLat/nearLon igual son válidos solos: sirven de origen para sort=distance
    # (radio, o el punto representativo de un withinPolygon) sin restringir el área.
    if (near_lat is None) != (near_lon is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="nearLat y nearLon deben enviarse juntos.",
        )
    if radius_km is not None and (near_lat is None or near_lon is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Para buscar por radio debes enviar nearLat, nearLon y radiusKm juntos.",
        )

    if sort == "distance" and (near_lat is None or near_lon is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sort=distance requiere nearLat y nearLon.",
        )

    if order is not None and sort is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="order requiere sort.",
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
        sort=sort,
        order=order,
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


def build_full_containment_expr(f: OccurrenceFilters):
    """True si el área de búsqueda (radio y/o polígono) contiene por completo la
    ubicación real de la ocurrencia —su footprint (círculo de incertidumbre o
    polígono) o, si no tiene, su punto—; NULL si no se pidió ningún área. Con
    ambas áreas a la vez, deben contenerla las dos. Distingue lo que cae dentro
    del área con certeza de lo que, por su incertidumbre, podría quedar fuera."""
    shape = func.coalesce(
        Occurrence.footprintGeom,
        cast(Occurrence.location, Geometry(geometry_type="POINT", srid=4326)),
    )
    parts = []

    if f.near_lat is not None and f.near_lon is not None and f.radius_km is not None:
        origin = cast(
            func.ST_SetSRID(func.ST_MakePoint(f.near_lon, f.near_lat), 4326),
            Geography(geometry_type="POINT", srid=4326),
        )
        search_circle = cast(
            func.ST_Buffer(origin, f.radius_km * 1000.0, "quad_segs=16"),
            Geometry(srid=4326),
        )
        parts.append(func.ST_Contains(search_circle, shape))

    if f.within_polygon:
        polygon = func.ST_GeomFromText(f.within_polygon, 4326)
        parts.append(func.ST_Contains(polygon, shape))

    if not parts:
        return cast(null(), Boolean)
    return and_(*parts) if len(parts) > 1 else parts[0]


def _origin_geography(f: OccurrenceFilters):
    """Punto de referencia (nearLat/nearLon) como geography, o None si no se envió."""
    if f.near_lat is None or f.near_lon is None:
        return None
    return cast(
        func.ST_SetSRID(func.ST_MakePoint(f.near_lon, f.near_lat), 4326),
        Geography(geometry_type="POINT", srid=4326),
    )


def _location_expr():
    """coalesce usado tanto para filtrar `location` como para mostrarlo y para ordenarlo
    (calza con el índice funcional ix_occurrence_location_unaccent)."""
    return func.coalesce(
        Occurrence.locality,
        Occurrence.municipality,
        Occurrence.stateProvince,
        Occurrence.country,
    )


def _unaccent_lower(expr):
    """Misma expresión que los índices ix_*_unaccent: unaccent_immutable(lower(expr))."""
    return func.unaccent_immutable(func.lower(expr))


def _direction(expr, asc: bool):
    return (expr.asc() if asc else expr.desc()).nulls_last()


def build_order_by(f: OccurrenceFilters):
    """Orden explícito pedido por el cliente (lista de cláusulas ORDER BY), o [] para el
    orden por defecto del llamador. Un solo criterio a la vez, en cualquiera de las dos
    direcciones (`order`; por defecto "asc", salvo "date" que por defecto es "desc" — más
    reciente primero). Cada uno tiene un índice dedicado (ver models/models.py) para que el
    orden no implique un scan completo:

    - distance: requiere nearLat/nearLon. Usa el operador KNN `<->` (no ST_Distance) para
      que el GiST de `location` (ix_occurrence_location_gist) lo resuelva sin escanear todo.
    - date: por evento (year, month, day) -> ix_occurrence_event_date.
    - scientificName/family/collector/location/institution: alfabético, acento-insensible,
      con la misma expresión unaccent+lower de su índice ix_*_unaccent (si no, Postgres no
      puede usarlo).

    Sin valor en el campo, siempre al final (nulls_last), sea cual sea la dirección.
    """
    if f.sort is None:
        return []

    default_order = "desc" if f.sort == "date" else "asc"
    asc = (f.order or default_order) == "asc"

    if f.sort == "distance":
        origin = _origin_geography(f)
        if origin is None:
            return []
        return [_direction(Occurrence.location.op("<->")(origin), asc)]

    if f.sort == "date":
        return [_direction(c, asc) for c in (Occurrence.year, Occurrence.month, Occurrence.day)]

    field_by_sort = {
        "scientificName": Taxon.scientificName,
        "family": Taxon.family,
        "collector": Occurrence.recordedBy,
        "location": _location_expr(),
        "institution": Institution.institutionName,
    }
    return [_direction(_unaccent_lower(field_by_sort[f.sort]), asc)]


def build_distance_expr(f: OccurrenceFilters):
    """Distancia en metros de cada registro a nearLat/nearLon (radio, o el punto
    representativo de un withinPolygon, calculado por el cliente); NULL sin punto de
    referencia. Independiente de `sort`: se puede mostrar sin ordenar por ella."""
    origin = _origin_geography(f)
    if origin is None:
        return cast(null(), Float)
    return func.ST_Distance(Occurrence.location, origin)


def apply_occurrence_filters(stmt: Select, filters: OccurrenceFilters) -> Select:
    f = filters

    # mismas expresiones que usas en el endpoint
    code_expr = func.coalesce(Occurrence.catalogNumber, Occurrence.recordNumber)
    location_expr = _location_expr()

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
