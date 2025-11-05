# backend/routers/occurrence.py
from __future__ import annotations

from typing import Any, Dict, List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from backend.config.database import get_db
from backend.models.models import (
    Occurrence,
    MeasurementOrFact,
    Collection,
    Organism,
    Location,
    Taxon
)

from backend.auth.jwt import get_current_user, get_current_payload
from pydantic import BaseModel, Field, HttpUrl, constr

router = APIRouter(
    prefix="/occurrences",
    tags=["Occurrences"],
    dependencies=[Depends(get_current_payload)],
)


def _allowed_update_fields() -> set[str]:
    cols = set(Occurrence.__table__.columns.keys())

    blocked = {
        "id",
        "occurrenceID",
        "event_id", "location_id", "geological_context_id", "taxon_id", "organism_id",
        "collection_id",
    }
    return cols - blocked


def _apply_partial_update(instance: Occurrence, data: Dict[str, Any]) -> List[str]:
    """Aplica un parche de forma segura contra la whitelist."""
    allowed = _allowed_update_fields()
    touched: List[str] = []
    for k, v in data.items():
        if k in allowed:
            setattr(instance, k, v)
            touched.append(k)
    return touched


def _not_found_err(by: str, value: Any) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Occurrence no encontrada por {by}={value!r}",
    )


class MeasurementIn(BaseModel):
    measurementType: Optional[str] = None
    measurementValue: Optional[str] = None
    measurementUnit: Optional[str] = None
    # extras opcionales del modelo:
    measurementAccuracy: Optional[str] = None
    measurementMethod: Optional[str] = None
    measurementRemarks: Optional[str] = None

class MediaIn(BaseModel):
    # Este endpoint no sube archivos; asume que ya tienes URL o lo completarás luego.
    identifier: Optional[str] = None  # URL pública (si la tienes)
    title: Optional[str] = None
    description: Optional[str] = None
    creator: Optional[str] = None
    license: Optional[str] = None
    rightsHolder: Optional[str] = None
    accessRights: Optional[str] = None
    format: Optional[str] = None
    type: Optional[str] = None

class TaxonIn(BaseModel):
    scientificName: constr(strip_whitespace=True, min_length=1)
    scientificNameAuthorship: Optional[str] = None
    # si ya tienes ids externos, puedes aceptarlos opcionalmente:
    taxonID: Optional[str] = None

class IdentificationIn(BaseModel):
    identifiedBy: Optional[List[str]] = None  # se convertirá a CSV
    identifiedByID: Optional[List[str]] = None  # CSV (ORCID/URI)
    dateIdentified: Optional[str] = None
    identificationReferences: Optional[str] = None
    identificationVerificationStatus: Optional[str] = None
    identificationRemarks: Optional[str] = None
    identificationQualifier: Optional[str] = None
    typeStatus: Optional[str] = None

class EventIn(BaseModel):
    eventDate: Optional[str] = None  # ISO8601 o rango "YYYY-MM-DD/YYYY-MM-DD"
    samplingProtocol: Optional[str] = None
    habitat: Optional[str] = None
    # si quieres, puedes permitir year/month/day para derivaciones futuras:
    # year: Optional[int] = None
    # month: Optional[int] = None
    # day: Optional[int] = None

class LocationIn(BaseModel):
    country: Optional[str] = None
    countryCode: Optional[str] = None
    stateProvince: Optional[str] = None
    county: Optional[str] = None
    municipality: Optional[str] = None
    locality: Optional[str] = None
    decimalLatitude: Optional[float] = None
    decimalLongitude: Optional[float] = None
    geodeticDatum: Optional[str] = "WGS84"
    coordinateUncertaintyInMeters: Optional[float] = Field(default=None, ge=0)
    minimumElevationInMeters: Optional[float] = None
    maximumElevationInMeters: Optional[float] = None

class OrganismIn(BaseModel):
    # Si el usuario quiere asociar a uno existente:
    organism_existing_id: Optional[int] = Field(default=None, description="Usa un Organism ya existente")
    # Si desea crear uno nuevo:
    organismID: Optional[str] = None  # identificador DwC externo (no PK)
    organismScope: Optional[str] = None
    sex: Optional[str] = None
    lifeStage: Optional[str] = None
    reproductiveCondition: Optional[str] = None
    establishmentMeans: Optional[str] = None
    organismRemarks: Optional[str] = None

class OccurrenceIn(BaseModel):
    # ---- claves y colección ----
    collection_id: int = Field(..., description="FK a Collection.id")
    occurrenceID: Optional[str] = Field(default=None, description="Identificador DwC externo (UUID/URI). No es PK.")
    catalogNumber: Optional[str] = None
    recordNumber: Optional[str] = None

    # ---- personas ----
    recordedBy: Optional[List[str]] = None  # se convertirá a CSV
    recordedByID: Optional[List[str]] = None  # CSV (ORCID/URI)

    # ---- conteo y estado ----
    individualCount: Optional[int] = Field(default=None, ge=0)
    occurrenceStatus: Optional[Literal["present", "absent"]] = "present"

    # ---- curaduría ----
    preparations: Optional[str] = None
    disposition: Optional[str] = None

    # ---- notas ----
    occurrenceRemarks: Optional[str] = None

    # ---- record-level ----
    license: Optional[str] = None
    rightsHolder: Optional[str] = None
    accessRights: Optional[str] = None

class CreateOccurrenceBody(BaseModel):
    occurrence: OccurrenceIn
    event: EventIn
    location: LocationIn
    taxon: TaxonIn
    identification: IdentificationIn
    organism: Optional[OrganismIn] = None
    measurements: Optional[List[MeasurementIn]] = None
    media: Optional[List[MediaIn]] = None


# =========================
# Helpers
# =========================

def _csv_or_none(values: Optional[List[str]]) -> Optional[str]:
    if not values:
        return None
    # Limpia vacíos y une con ; espacio
    cleaned = [v.strip() for v in values if v and v.strip()]
    return "; ".join(cleaned) if cleaned else None

def _ensure_collection(db: Session, collection_id: int) -> None:
    ok = db.execute(
        select(Collection.id).where(Collection.id == collection_id)
    ).scalar_one_or_none()
    if not ok:
        raise HTTPException(status_code=404, detail="Collection no encontrada")

def _get_or_create_taxon(db: Session, taxon_in: TaxonIn) -> Taxon:
    # Estrategia simple: buscar por scientificName; si no existe, crear.
    q = select(Taxon).where(Taxon.scientificName == taxon_in.scientificName)
    taxon = db.execute(q).scalar_one_or_none()
    if taxon:
        # opcional: actualizar authorship si viene y no está
        if taxon_in.scientificNameAuthorship and not taxon.scientificNameAuthorship:
            taxon.scientificNameAuthorship = taxon_in.scientificNameAuthorship
        if taxon_in.taxonID and not taxon.taxonID:
            taxon.taxonID = taxon_in.taxonID
        return taxon

    taxon = Taxon(
        scientificName=taxon_in.scientificName,
        scientificNameAuthorship=taxon_in.scientificNameAuthorship,
        taxonID=taxon_in.taxonID,
    )
    db.add(taxon)
    db.flush()  # asigna taxon.id
    return taxon

def _get_or_create_organism(db: Session, org_in: OrganismIn | None) -> Optional[Organism]:
    if not org_in:
        return None
    if org_in.organism_existing_id:
        org = db.get(Organism, org_in.organism_existing_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organism existente no encontrado")
        return org
    # crear nuevo si hay al menos un dato o si quiere forzarlo
    fields = (
        org_in.organismID, org_in.organismScope, org_in.sex, org_in.lifeStage,
        org_in.reproductiveCondition, org_in.establishmentMeans, org_in.organismRemarks
    )
    if any(fields):
        org = Organism(
            organismID=org_in.organismID,
            organismScope=org_in.organismScope,
            sex=org_in.sex,
            lifeStage=org_in.lifeStage,
            reproductiveCondition=org_in.reproductiveCondition,
            establishmentMeans=org_in.establishmentMeans,
            organismRemarks=org_in.organismRemarks,
        )
        db.add(org)
        db.flush()
        return org
    return None


# =========================
# Endpoint
# =========================

@router.post("", summary="Create occurrence with nested data")
def create_occurrence(
    payload: CreateOccurrenceBody = Body(...),
    db: Session = Depends(get_db),
):
    """
    Crea Location → Event → Taxon → (Organism opcional) → Occurrence → Identification → Measurements → Media.
    No acepta IDs de PK del cliente. Los genera el backend.
    """
    # 0) Validaciones base
    _ensure_collection(db, payload.occurrence.collection_id)

    # 1) Location
    loc_in = payload.location
    location = Location(
        country=loc_in.country,
        countryCode=loc_in.countryCode,
        stateProvince=loc_in.stateProvince,
        county=loc_in.county,
        municipality=loc_in.municipality,
        locality=loc_in.locality,
        decimalLatitude=loc_in.decimalLatitude,
        decimalLongitude=loc_in.decimalLongitude,
        geodeticDatum=loc_in.geodeticDatum,
        coordinateUncertaintyInMeters=loc_in.coordinateUncertaintyInMeters,
        minimumElevationInMeters=loc_in.minimumElevationInMeters,
        maximumElevationInMeters=loc_in.maximumElevationInMeters,
    )
    db.add(location)
    db.flush()  # asigna location.id

    # 2) Event
    ev_in = payload.event
    event = Event(
        eventDate=ev_in.eventDate,
        samplingProtocol=ev_in.samplingProtocol,
        habitat=ev_in.habitat,
        location_id=location.id,
    )
    db.add(event)
    db.flush()  # event.id

    # 3) Taxon
    taxon = _get_or_create_taxon(db, payload.taxon)

    # 4) Organism (opcional)
    organism = _get_or_create_organism(db, payload.organism)

    # 5) Occurrence
    occ_in = payload.occurrence
    occurrence = Occurrence(
        occurrenceID=occ_in.occurrenceID,  # identificador DwC externo (no PK)
        catalogNumber=occ_in.catalogNumber,
        recordNumber=occ_in.recordNumber,
        recordedBy=_csv_or_none(occ_in.recordedBy),
        recordedByID=_csv_or_none(occ_in.recordedByID),
        individualCount=occ_in.individualCount,
        occurrenceStatus=occ_in.occurrenceStatus or "present",
        preparations=occ_in.preparations,
        disposition=occ_in.disposition,
        occurrenceRemarks=occ_in.occurrenceRemarks,
        modified=datetime.utcnow(),
        license=occ_in.license,
        rightsHolder=occ_in.rightsHolder,
        accessRights=occ_in.accessRights,
        collection_id=occ_in.collection_id,
        event_id=event.id,
        location_id=location.id,
        taxon_id=taxon.id,
        organism_id=organism.id if organism else None,
    )
    db.add(occurrence)
    db.flush()  # occurrence.id

    # 6) Identification (mínimo 1 registro con lo ingresado)
    ident_in = payload.identification
    identification = Identification(
        identifiedBy=_csv_or_none(ident_in.identifiedBy),
        identifiedByID=_csv_or_none(ident_in.identifiedByID),
        dateIdentified=ident_in.dateIdentified,
        identificationReferences=ident_in.identificationReferences,
        identificationVerificationStatus=ident_in.identificationVerificationStatus,
        identificationRemarks=ident_in.identificationRemarks,
        identificationQualifier=ident_in.identificationQualifier,
        typeStatus=(ident_in.typeStatus if ident_in.typeStatus and ident_in.typeStatus != "none" else None),
        occurrence_id=occurrence.id,
        organism_id=organism.id if organism else None,
        taxon_id=taxon.id,
    )
    db.add(identification)

    # 7) Measurements (MoF)
    if payload.measurements:
        for m in payload.measurements:
            if not (m.measurementType or m.measurementValue or m.measurementUnit):
                continue
            mof = MeasurementOrFact(
                measurementType=m.measurementType,
                measurementValue=m.measurementValue,
                measurementUnit=m.measurementUnit,
                measurementAccuracy=m.measurementAccuracy,
                measurementMethod=m.measurementMethod,
                measurementRemarks=m.measurementRemarks,
                occurrence_id=occurrence.id,
                event_id=event.id,
                organism_id=organism.id if organism else None,
                taxon_id=taxon.id,
            )
            db.add(mof)

    # 8) Media
    if payload.media:
        for media in payload.media:
            mm = Multimedia(
                identifier=media.identifier,
                title=media.title,
                description=media.description,
                creator=media.creator,
                license=media.license,
                rightsHolder=media.rightsHolder,
                accessRights=media.accessRights,
                format=media.format,
                type=media.type,
                occurrence_id=occurrence.id,
                event_id=event.id,
                organism_id=organism.id if organism else None,
                taxon_id=taxon.id,
            )
            db.add(mm)

    db.commit()

    return {
        "message": "Occurrence creada",
        "occurrence": {
            "id": occurrence.id,
            "occurrenceID": occurrence.occurrenceID,
            "catalogNumber": occurrence.catalogNumber,
            "collection_id": occurrence.collection_id,
        },
        "links": {
            "event_id": event.id,
            "location_id": location.id,
            "taxon_id": taxon.id,
            "organism_id": organism.id if organism else None,
        }
    }

@router.get("", summary="Listar occurrences (paginado)")
def list_occurrences(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
    page: int = Query(1, ge=1, description="Número de página (>=1)"),
    per_page: int = Query(50, ge=1, le=200, description="Tamaño de página (1..200)"),
    q: Optional[str] = Query(None, description="Búsqueda simple por catalogNumber/occurrenceID"),
):
    if not current_user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")

    query = select(Occurrence)

    if q:
        query = query.where(
            (Occurrence.catalogNumber.ilike(f"%{q}%")) |
            (Occurrence.occurrenceID.ilike(f"%{q}%"))
        )

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = (
        db.execute(
            query.offset((page - 1) * per_page).limit(per_page)
        ).scalars().all()
    )

    return {
        "page": page,
        "per_page": per_page,
        "total": total or 0,
        "pages": (0 if not total else ( (total + per_page - 1) // per_page )),
        "items": items,
    }


@router.get("/{id}", summary="Obtener occurrence por id interno")
def get_occurrence_by_id(id: int, db: Session = Depends(get_db)):
    occ = db.get(Occurrence, id)
    if not occ:
        raise _not_found_err("id", id)
    return occ


@router.get("/by-occurrence-id/{occurrenceID}", summary="Obtener occurrence por occurrenceID (DwC)")
def get_occurrence_by_occurrence_id(occurrenceID: str, db: Session = Depends(get_db)):
    occ = db.execute(
        select(Occurrence).where(Occurrence.occurrenceID == occurrenceID)
    ).scalar_one_or_none()
    if not occ:
        raise _not_found_err("occurrenceID", occurrenceID)
    return occ


@router.patch("/{id}", summary="Actualizar parcialmente por id interno")
def patch_occurrence_by_id(
    id: int,
    payload: Dict[str, Any] = Body(..., description="Campos DwC a actualizar (partial)"),
    db: Session = Depends(get_db),
):
    occ = db.get(Occurrence, id)
    if not occ:
        raise _not_found_err("id", id)

    touched = _apply_partial_update(occ, payload)
    if not touched:
        return {"updated": 0, "touched": []}

    db.add(occ)
    db.commit()
    db.refresh(occ)
    return {"updated": 1, "touched": touched, "occurrence": occ}


@router.patch("/by-occurrence-id/{occurrenceID}", summary="Actualizar parcialmente por occurrenceID (DwC)")
def patch_occurrence_by_occurrence_id(
    occurrenceID: str,
    payload: Dict[str, Any] = Body(..., description="Campos DwC a actualizar (partial)"),
    db: Session = Depends(get_db),
):
    occ = db.execute(
        select(Occurrence).where(Occurrence.occurrenceID == occurrenceID)
    ).scalar_one_or_none()
    if not occ:
        raise _not_found_err("occurrenceID", occurrenceID)

    touched = _apply_partial_update(occ, payload)
    if not touched:
        return {"updated": 0, "touched": []}

    db.add(occ)
    db.commit()
    db.refresh(occ)
    return {"updated": 1, "touched": touched, "occurrence": occ}


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar occurrence por id interno")
def delete_occurrence_by_id(id: int, db: Session = Depends(get_db)):
    occ = db.get(Occurrence, id)
    if not occ:
        raise _not_found_err("id", id)
    db.delete(occ)
    db.commit()
    return


@router.delete("/by-occurrence-id/{occurrenceID}", status_code=status.HTTP_204_NO_CONTENT, summary="Eliminar occurrence por occurrenceID (DwC)")
def delete_occurrence_by_occurrence_id(occurrenceID: str, db: Session = Depends(get_db)):
    occ = db.execute(
        select(Occurrence).where(Occurrence.occurrenceID == occurrenceID)
    ).scalar_one_or_none()
    if not occ:
        raise _not_found_err("occurrenceID", occurrenceID)
    db.delete(occ)
    db.commit()
    return
