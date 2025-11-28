# backend/services/occurrence_filters.py

from datetime import date
from typing import Optional

from fastapi import Query
from sqlalchemy import Select, func

from backend.models.models import Occurrence, Institution, Taxon
from backend.schemas.occurrence import OccurrenceFilters


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
) -> OccurrenceFilters:
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


def apply_occurrence_filters(stmt: Select, filters: OccurrenceFilters) -> Select:
    f = filters
    print(f)

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
        print("scientific name entrando")
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

    # Rango de fechas -> Occurrence.eventDate (string ISO o similar)
    if f.date_from:
        stmt = stmt.where(Occurrence.eventDate >= f.date_from)
    if f.date_to:
        stmt = stmt.where(Occurrence.eventDate <= f.date_to)

    if f.collection_id is not None:
        stmt = stmt.where(Occurrence.collectionId == f.collection_id)

    if f.institution_id is not None:
        stmt = stmt.where(Institution.id == f.institution_id)

    return stmt
