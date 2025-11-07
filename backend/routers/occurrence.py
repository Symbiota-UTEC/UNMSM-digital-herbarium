# backend/routers/occurrence.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, exists,  or_, func
from sqlalchemy.orm import Session, selectinload

from pydantic import BaseModel
from datetime import datetime, date

from backend.config.database import get_db
from backend.auth.jwt import get_current_user

from backend.models.models import (
    Occurrence,
    Collection,
    Location,
    Taxon,
    Event,
    User,
    CollectionPermission,
    Institution,
)

router = APIRouter(
    prefix="/occurrences",
    tags=["Occurrences"],
)


def _fmt_dt(v: Optional[datetime | date | str]) -> Optional[str]:
    """
    Normaliza fechas a 'dd/mm/aaaa'.
    - datetime/date => se formatea
    - str => intenta parsear ISO u otros formatos comunes; si no puede, devuelve la misma string
    - None => None
    """
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%d/%m/%Y")
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        # normalizar 'Z'
        s2 = s.replace("Z", "+00:00")
        # 1) ISO flexible
        try:
            dt = datetime.fromisoformat(s2)
            return dt.strftime("%d/%m/%Y")
        except Exception:
            pass
        # 2) formatos comunes de fecha
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
            try:
                dt = datetime.strptime(s, fmt)
                return dt.strftime("%d/%m/%Y")
            except Exception:
                continue
        # no parseable: devuélvela como vino
        return s
    return None

class CollectionSummary(BaseModel):
    id: int
    collectionCode: Optional[str] = None
    collectionName: Optional[str] = None
    institution_id: Optional[int] = None

    class Config:
        orm_mode = True
        from_attributes = True

class EventOut(BaseModel):
    id: int
    eventDate: Optional[str] = None
    year: Optional[int] = None
    month: Optional[int] = None
    day: Optional[int] = None
    verbatimEventDate: Optional[str] = None
    fieldNumber: Optional[str] = None
    samplingProtocol: Optional[str] = None
    samplingEffort: Optional[str] = None
    habitat: Optional[str] = None
    eventRemarks: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

class LocationOut(BaseModel):
    id: int
    stateProvince: Optional[str] = None
    county: Optional[str] = None
    municipality: Optional[str] = None
    locality: Optional[str] = None
    verbatimLocality: Optional[str] = None
    decimalLatitude: Optional[float] = None
    decimalLongitude: Optional[float] = None
    geodeticDatum: Optional[str] = None
    coordinateUncertaintyInMeters: Optional[float] = None
    coordinatePrecision: Optional[float] = None
    minimumElevationInMeters: Optional[float] = None
    maximumElevationInMeters: Optional[float] = None
    verbatimElevation: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

class TaxonOut(BaseModel):
    id: int
    scientificName: Optional[str] = None
    scientificNameAuthorship: Optional[str] = None
    family: Optional[str] = None
    genus: Optional[str] = None
    specificEpithet: Optional[str] = None
    infraspecificEpithet: Optional[str] = None
    taxonRank: Optional[str] = None
    acceptedNameUsage: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

class OccurrenceOut(BaseModel):
    # identificador
    id: int

    # ocurrencia
    occurrenceID: Optional[str] = None
    catalogNumber: Optional[str] = None
    recordNumber: Optional[str] = None
    recordedBy: Optional[str] = None
    recordEnteredBy: Optional[str] = None
    individualCount: Optional[int] = None
    occurrenceStatus: Optional[str] = None
    preparations: Optional[str] = None
    disposition: Optional[str] = None
    occurrenceRemarks: Optional[str] = None
    modified: Optional[str] = None
    license: Optional[str] = None
    rightsHolder: Optional[str] = None
    accessRights: Optional[str] = None
    bibliographicCitation: Optional[str] = None

    collection: Optional[CollectionSummary] = None
    event: Optional[EventOut] = None
    location: Optional[LocationOut] = None
    taxon: Optional[TaxonOut] = None

    class Config:
        orm_mode = True
        from_attributes = True


def _user_can_view_collection(db: Session, user: User, collection: Collection) -> bool:
    """Reglas:
       - superuser: acceso
       - permiso explícito (viewer/editor/owner): acceso
       - admin de institución y misma institución: acceso
    """
    if getattr(user, "is_superuser", False):
        return True

    # permiso explícito
    perm_exists = db.scalar(
        select(
            exists().where(
                (CollectionPermission.collection_id == collection.id)
                & (CollectionPermission.user_id == user.id)
            )
        )
    )
    if perm_exists:
        return True

    # admin de la institución que posee la colección
    if getattr(user, "is_institution_admin", False) and collection.institution_id and user.institution_id:
        if int(collection.institution_id) == int(user.institution_id):
            return True

    return False

# =========================
# Serializadores (siempre con todas las claves)
# =========================

def _to_collection_dict(col: Optional[Collection]) -> Optional[dict]:
    if col is None:
        return None
    return {
        "id": col.id,
        "collectionCode": col.collectionCode,
        "collectionName": col.collectionName,
        "institution_id": col.institution_id,
    }

def _to_event_dict(evt: Optional[Event]) -> Optional[dict]:
    if evt is None:
        return None
    return {
        "id": evt.id,
        "eventDate": _fmt_dt(evt.eventDate),  # normaliza si parece fecha
        "year": evt.year,
        "month": evt.month,
        "day": evt.day,
        "verbatimEventDate": evt.verbatimEventDate,
        "fieldNumber": evt.fieldNumber,
        "samplingProtocol": evt.samplingProtocol,
        "samplingEffort": evt.samplingEffort,
        "habitat": evt.habitat,
        "eventRemarks": evt.eventRemarks,
    }

def _to_location_dict(loc: Optional[Location]) -> Optional[dict]:
    if loc is None:
        return None
    return {
        "id": loc.id,
        "stateProvince": loc.stateProvince,
        "county": loc.county,
        "municipality": loc.municipality,
        "locality": loc.locality,
        "verbatimLocality": loc.verbatimLocality,
        "decimalLatitude": loc.decimalLatitude,
        "decimalLongitude": loc.decimalLongitude,
        "geodeticDatum": loc.geodeticDatum,
        "coordinateUncertaintyInMeters": loc.coordinateUncertaintyInMeters,
        "coordinatePrecision": loc.coordinatePrecision,
        "minimumElevationInMeters": loc.minimumElevationInMeters,
        "maximumElevationInMeters": loc.maximumElevationInMeters,
        "verbatimElevation": loc.verbatimElevation,
    }

def _to_taxon_dict(tx: Optional[Taxon]) -> Optional[dict]:
    if tx is None:
        return None
    return {
        "id": tx.id,
        "scientificName": tx.scientificName,
        "scientificNameAuthorship": tx.scientificNameAuthorship,
        "family": tx.family,
        "genus": tx.genus,
        "specificEpithet": tx.specificEpithet,
        "infraspecificEpithet": tx.infraspecificEpithet,
        "taxonRank": tx.taxonRank,
        "acceptedNameUsage": tx.acceptedNameUsage,
    }



@router.get(
    "/{occurrence_id}",
    response_model=OccurrenceOut,
    status_code=status.HTTP_200_OK,
)
def get_occurrence_by_id(
    occurrence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """ Devuelve una ocurrencia por ID, rellena con null lo que no encuentra"""
    stmt = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.collection),
            selectinload(Occurrence.event),
            selectinload(Occurrence.location),
            selectinload(Occurrence.taxon),
        )
        .where(Occurrence.id == occurrence_id)
    )
    occ = db.scalar(stmt)

    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")

    if not occ.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied (no collection)")

    if not _user_can_view_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    payload = {
        "id": occ.id,
        "occurrenceID": occ.occurrenceID,
        "catalogNumber": occ.catalogNumber,
        "recordNumber": occ.recordNumber,
        "recordedBy": occ.recordedBy,
        "recordEnteredBy": occ.recordEnteredBy,
        "individualCount": occ.individualCount,
        "occurrenceStatus": occ.occurrenceStatus,
        "preparations": occ.preparations,
        "disposition": occ.disposition,
        "occurrenceRemarks": occ.occurrenceRemarks,
        "modified": _fmt_dt(occ.modified),  # formato en dd/mm/aaaa
        "license": occ.license,
        "rightsHolder": occ.rightsHolder,
        "accessRights": occ.accessRights,
        "bibliographicCitation": occ.bibliographicCitation,
        "collection": _to_collection_dict(occ.collection),
        "event": _to_event_dict(occ.event),
        "location": _to_location_dict(occ.location),
        "taxon": _to_taxon_dict(occ.taxon),
    }

    return OccurrenceOut.model_validate(payload, from_attributes=True)



@router.get("", summary="Lista ocurrencias visibles (vista básica) para el usuario actual")
def list_occurrences_basic(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    q: str | None = None,
    collection_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_select = (
        select(
            Occurrence.id.label("occ_id"),
            Occurrence.catalogNumber.label("catalog_number"),
            Occurrence.modified.label("modified"),
            Occurrence.recordedBy.label("recorded_by"),
            Collection.collectionName.label("collection_name"),
            Institution.id.label("inst_id"),
            Institution.institutionCode.label("inst_code"),
            Institution.institutionName.label("inst_name"),
            Taxon.scientificName.label("sci_name"),
            Location.locality.label("locality"),
        )
        .join(Collection, Occurrence.collection_id == Collection.id)
        .outerjoin(Institution, Collection.institution_id == Institution.id)
        .outerjoin(Taxon, Occurrence.taxon_id == Taxon.id)
        .outerjoin(Location, Occurrence.location_id == Location.id)
    )

    count_select = (
        select(Occurrence.id)
        .join(Collection, Occurrence.collection_id == Collection.id)
        .outerjoin(Institution, Collection.institution_id == Institution.id)
        .outerjoin(Taxon, Occurrence.taxon_id == Taxon.id)
        .outerjoin(Location, Occurrence.location_id == Location.id)
    )

    if not current_user.is_superuser:
        perm_subq = (
            select(CollectionPermission.collection_id)
            .where(
                CollectionPermission.user_id == current_user.id,
                CollectionPermission.role.in_(["viewer", "editor", "owner"]),
            )
        )
        conds = [Occurrence.collection_id.in_(perm_subq)]
        if current_user.is_institution_admin and current_user.institution_id:
            conds.append(Collection.institution_id == current_user.institution_id)

        base_select = base_select.where(or_(*conds))
        count_select = count_select.where(or_(*conds))

    if collection_id is not None:
        base_select = base_select.where(Occurrence.collection_id == collection_id)
        count_select = count_select.where(Occurrence.collection_id == collection_id)

    if q:
        like = f"%{q}%"
        text_filter = or_(
            Occurrence.catalogNumber.ilike(like),
            Taxon.scientificName.ilike(like),
            Collection.collectionName.ilike(like),
            Institution.institutionName.ilike(like),
            Location.locality.ilike(like),
        )
        base_select = base_select.where(text_filter)
        count_select = count_select.where(text_filter)

    limit = page_size
    offset = (page - 1) * page_size

    total = db.scalar(select(func.count()).select_from(count_select.subquery())) or 0

    rows = db.execute(
        base_select
        .order_by(Occurrence.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    items = []
    for (
        occ_id,
        catalog_number,
        modified,
        recorded_by,
        collection_name,
        inst_id,
        inst_code,
        inst_name,
        sci_name,
        locality,
    ) in rows:
        items.append({
            "id": occ_id,
            "catalogNumber": catalog_number,
            "scientificName": sci_name,
            "collectionName": collection_name,
            "institution": (
                {
                    "id": inst_id,
                    "institutionCode": inst_code,
                    "institutionName": inst_name,
                } if inst_id is not None else None
            ),
            "locality": locality,
            "modified": modified.isoformat() if modified else None,
            "recordedBy": recorded_by,
        })

    total_pages = (total + limit - 1) // limit if limit > 0 else 0
    remaining_pages = max(total_pages - page, 0)

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "current_page": page,
        "total_pages": total_pages,
        "remaining_pages": remaining_pages,
    }
