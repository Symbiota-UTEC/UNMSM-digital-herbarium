# backend/schemas/admin_division.py
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class CountryOut(BaseModel):
    code: str
    name: str
    source: str
    adminLevels: int


class CountryListOut(BaseModel):
    items: List[CountryOut]


class AdminDivisionOut(BaseModel):
    id: UUID
    countryCode: str
    level: int
    code: str
    name: str
    parentId: Optional[UUID] = None
    source: str
    # URI estable para dwc:locationID (ubigeo o GeoNames)
    locationId: str


class AdminDivisionListOut(BaseModel):
    items: List[AdminDivisionOut]
