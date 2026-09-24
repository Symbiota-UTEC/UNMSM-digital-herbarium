# backend/services/admin_divisions.py
from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.models.models import AdminDivision, Country
from backend.schemas.admin_division import (
    AdminDivisionListOut,
    AdminDivisionOut,
    CountryListOut,
    CountryOut,
    ResolvedDivision,
    ResolveOut,
)


def _location_id(source: str, code: str) -> str:
    """URI estable para dwc:locationID según la fuente."""
    if source == "INEI":
        return f"urn:inei:ubigeo:{code}"
    return f"https://www.geonames.org/{code}/"


def _division_location_id(division: AdminDivision) -> str:
    return _location_id(division.source, division.sourceId or division.code)


def list_countries(db: Session) -> CountryListOut:
    rows = db.scalars(select(Country).order_by(Country.name)).all()
    return CountryListOut(
        items=[
            CountryOut(
                code=c.code,
                name=c.name,
                source=c.source,
                adminLevels=c.adminLevels,
            )
            for c in rows
        ]
    )


def list_divisions(
    db: Session,
    country_code: str | None = None,
    level: int | None = None,
    parent_id=None,
) -> AdminDivisionListOut:
    stmt = select(AdminDivision).order_by(AdminDivision.normalizedName)
    if parent_id is not None:
        stmt = stmt.where(AdminDivision.parentId == parent_id)
    else:
        if country_code:
            stmt = stmt.where(AdminDivision.countryCode == country_code.upper())
        if level is not None:
            stmt = stmt.where(AdminDivision.level == level)
    rows = db.scalars(stmt).all()
    return AdminDivisionListOut(
        items=[
            AdminDivisionOut(
                id=d.id,
                countryCode=d.countryCode,
                level=d.level,
                code=d.code,
                name=d.name,
                parentId=d.parentId,
                source=d.source,
                locationId=_division_location_id(d),
            )
            for d in rows
        ]
    )


def resolve_point(db: Session, lat: float, lon: float) -> ResolveOut:
    """División administrativa que contiene el punto (solo Perú, por ahora)."""
    rows = db.execute(
        text(
            "SELECT level, code, name FROM admin_division "
            "WHERE country_code = 'PE' AND boundary IS NOT NULL "
            "AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)) "
            "ORDER BY level DESC"
        ),
        {"lat": lat, "lon": lon},
    ).fetchall()
    by_level = {r.level: r for r in rows}

    def div(r):
        return (
            ResolvedDivision(name=r.name, code=r.code, locationId=_location_id("INEI", r.code))
            if r
            else None
        )

    return ResolveOut(
        department=div(by_level.get(1)),
        province=div(by_level.get(2)),
        district=div(by_level.get(3)),
    )
