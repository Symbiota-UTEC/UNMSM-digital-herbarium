# backend/services/admin_divisions.py
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.models import AdminDivision, Country
from backend.schemas.admin_division import (
    AdminDivisionOut,
    AdminDivisionListOut,
    CountryListOut,
    CountryOut,
)


def _division_location_id(division: AdminDivision) -> str:
    """URI estable para dwc:locationID según la fuente del registro."""
    if division.source == "INEI":
        return f"urn:inei:ubigeo:{division.code}"
    return f"https://www.geonames.org/{division.sourceId}/"


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
