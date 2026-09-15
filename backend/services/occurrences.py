# backend/services/occurrences.py
from __future__ import annotations
from uuid import UUID

import json
from datetime import datetime, date
from typing import Optional, Any, Dict, List

from fastapi import HTTPException, status
from sqlalchemy import select, delete, or_, func, and_
from sqlalchemy.orm import Session, selectinload

from backend.models.models import (
    Occurrence,
    Collection,
    CollectionPermission,
    Institution,
    User,
    Identification,
    Identifier,
    Taxon,
)
from backend.schemas import Page
from backend.schemas.occurrence import (
    OccurrenceBriefItem,
    DynamicPropsIn,
    OccurrenceFilters,
    OccurrenceCreateIn,
    OccurrenceUpdateIn,
    IdentificationCreateIn,
)
from backend.services.occurrence_filters import apply_occurrence_filters
from backend.services.collection_permissions import (
    user_can_view_collection,
    user_can_edit_collection,
)


# =========================
# Helpers
# =========================


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
        s2 = s.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s2)
            return dt.strftime("%d/%m/%Y")
        except Exception:
            pass
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
            try:
                dt = datetime.strptime(s, fmt)
                return dt.strftime("%d/%m/%Y")
            except Exception:
                continue
        return s
    return None


def _load_occurrence_full(db: Session, occurrence_id: UUID) -> Optional[Occurrence]:
    """Carga una Occurrence con todo lo que necesita `OccurrenceOut`: collection,
    identifications.identifiers, identifications.taxon e images."""
    stmt = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.collection),
            selectinload(Occurrence.identifications).selectinload(Identification.identifiers),
            selectinload(Occurrence.identifications).selectinload(Identification.taxon),
            selectinload(Occurrence.images),
        )
        .where(Occurrence.occurrenceId == occurrence_id)
    )
    return db.scalar(stmt)


def _load_occurrence_with_collection(db: Session, occurrence_id: UUID) -> Optional[Occurrence]:
    """Carga liviana (Occurrence + collection) para el chequeo de permisos antes
    de mutar; la respuesta final se recarga completa con `_load_occurrence_full`."""
    return db.scalar(
        select(Occurrence)
        .options(selectinload(Occurrence.collection))
        .where(Occurrence.occurrenceId == occurrence_id)
    )


def _apply_event_date_ymd(occ: Occurrence, event_date: Optional[str]) -> None:
    """Deriva year/month/day de un eventDate ISO ('YYYY-MM-DD') y los asigna sobre
    `occ`. Si no es un ISO date válido, no hace nada."""
    if not event_date:
        return
    try:
        parsed = date.fromisoformat(event_date)
    except ValueError:
        return
    occ.year = parsed.year
    occ.month = parsed.month
    occ.day = parsed.day


# =========================
# Casos de uso
# =========================


def create_occurrence(
    db: Session, payload: OccurrenceCreateIn, current_user: User
) -> Occurrence:
    # Verificamos que la colección exista y el usuario pueda editarla
    collection = db.scalar(select(Collection).where(Collection.collectionId == payload.collectionId))
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found"
        )

    if not user_can_edit_collection(db, current_user, collection):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para añadir ocurrencias en esta colección"
        )

    # Preparamos los datos del modelo Occurrence
    occ_data = payload.model_dump(
        exclude={"taxonId", "scientificName", "collectionId", "dateIdentified", "typeStatus", "isVerified", "identifiers"},
        exclude_unset=True
    )

    # Manejamos el UUID custom que envió el frontend si existe
    occ_data.pop("occurrenceID", None)

    occ = Occurrence(**occ_data)
    occ.collectionId = payload.collectionId
    occ.digitizerUserId = current_user.userId

    # Derivar year/month/day del eventDate si viene y no se enviaron explícitamente
    if payload.eventDate and occ.year is None:
        _apply_event_date_ymd(occ, payload.eventDate)

    db.add(occ)
    db.flush()

    # Manejar recordedBy simple si se desea (o dejarlo solo como texto,
    # en la vista de carga de csv creaba un OccurrenceAgent. Como es opcional,
    # podemos simplificarlo y solo mantener recordedBy en texto. El modelo lo tiene como string)

    # Manejamos Identificación y Taxón si viene
    if payload.scientificName or payload.taxonId:
        taxon_id = payload.taxonId
        if taxon_id:
            taxon_obj = db.scalar(select(Taxon).where(Taxon.taxonId == taxon_id))
            if not taxon_obj:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Taxon no encontrado"
                )

        ident = Identification(
            occurrenceId=occ.occurrenceId,
            taxonId=taxon_id,
            scientificName=payload.scientificName,
            dateIdentified=payload.dateIdentified,
            typeStatus=payload.typeStatus,
            isCurrent=True,
            isVerified=payload.isVerified or False,
        )
        db.add(ident)
        db.flush()

        # Crear Identifier(s) a partir de los datos enviados
        for idn in (payload.identifiers or []):
            name = idn.name.strip()
            if name:
                db.add(Identifier(
                    identificationId=ident.identificationId,
                    fullName=name,
                    orcID=idn.orcid or None,
                ))

        occ.currentIdentificationId = ident.identificationId
        db.add(occ)
        db.flush()

    # Hacemos load de relaciones
    db.commit()
    db.refresh(occ)

    # Lo volvemos a traer completo para que responda OccurrenceOut
    return _load_occurrence_full(db, occ.occurrenceId)


def get_occurrence_by_id(
    db: Session, occurrence_id: UUID, current_user: User
) -> Occurrence:
    occ = _load_occurrence_full(db, occurrence_id)

    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")

    if not occ.collection:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied (occurrence without collection)",
        )

    if not user_can_view_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return occ


def list_occurrences_basic(
    db: Session,
    page: int,
    page_size: int,
    collection_id: Optional[UUID],
    filters: OccurrenceFilters,
    current_user: User,
) -> Page[OccurrenceBriefItem]:
    is_superuser = current_user.isSuperuser
    is_inst_admin = current_user.isInstitutionAdmin
    user_inst_id = current_user.institutionId

    code_expr = func.coalesce(Occurrence.catalogNumber, Occurrence.recordNumber)
    location_expr = func.coalesce(
        Occurrence.locality,
        Occurrence.municipality,
        Occurrence.stateProvince,
        Occurrence.country,
    )

    # SELECT principal (para filas)
    base_select = (
        select(
            Occurrence.occurrenceId.label("occ_id"),
            code_expr.label("code"),
            Taxon.scientificName.label("scientific_name"),
            Taxon.family.label("family"),
            location_expr.label("location"),
            Occurrence.recordedBy.label("collector"),
            Occurrence.eventDate.label("date"),
            Collection.collectionId.label("collection_id"),
            Collection.institutionId.label("collection_institution_id"),
            Institution.institutionName.label("institution_name"),
        )
        .join(Collection, Occurrence.collectionId == Collection.collectionId)
        .outerjoin(
            Identification,
            and_(
                Identification.occurrenceId == Occurrence.occurrenceId,
                Identification.isCurrent.is_(True),
            ),
        )
        .outerjoin(Taxon, Taxon.taxonId == Identification.taxonId)
        .outerjoin(
            Institution,
            Collection.institutionId == Institution.institutionId,
        )
    )

    # SELECT para conteo (misma estructura de joins)
    count_select = (
        select(Occurrence.occurrenceId)
        .join(Collection, Occurrence.collectionId == Collection.collectionId)
        .outerjoin(
            Identification,
            and_(
                Identification.occurrenceId == Occurrence.occurrenceId,
                Identification.isCurrent.is_(True),
            ),
        )
        .outerjoin(Taxon, Taxon.taxonId == Identification.taxonId)
        .outerjoin(
            Institution,
            Collection.institutionId == Institution.institutionId,
        )
    )

    if not is_superuser:
        perm_subq = (
            select(CollectionPermission.collectionId)
            .where(
                CollectionPermission.userId == current_user.userId,
                CollectionPermission.role.in_(["viewer", "editor", "owner"]),
            )
        )

        conds = [Occurrence.collectionId.in_(perm_subq)]

        if is_inst_admin and user_inst_id:
            conds.append(Collection.institutionId == user_inst_id)

        base_select = base_select.where(or_(*conds))
        count_select = count_select.where(or_(*conds))

    # Filtrar por colección específica
    if collection_id is not None:
        base_select = base_select.where(Occurrence.collectionId == collection_id)
        count_select = count_select.where(Occurrence.collectionId == collection_id)

    base_select = apply_occurrence_filters(base_select, filters)
    count_select = apply_occurrence_filters(count_select, filters)

    limit = page_size
    offset = (page - 1) * page_size

    total = db.scalar(
        select(func.count()).select_from(count_select.subquery())
    ) or 0

    rows = db.execute(
        base_select
        .order_by(Occurrence.occurrenceId.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    items: List[OccurrenceBriefItem] = []
    for row in rows:
        items.append(
            OccurrenceBriefItem(
                occurrenceId=row.occ_id,
                code=row.code,
                scientificName=row.scientific_name,
                family=row.family,
                location=row.location,
                collector=row.collector,
                date=_fmt_dt(row.date),
                institutionName=row.institution_name,
            )
        )

    return Page[OccurrenceBriefItem].of(items, total=total, limit=limit, offset=offset)


def update_occurrence(
    db: Session, occurrence_id: UUID, payload: OccurrenceUpdateIn, current_user: User
) -> Occurrence:
    occ = _load_occurrence_full(db, occurrence_id)

    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")

    if not occ.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied (occurrence without collection)")

    if not user_can_edit_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para editar esta ocurrencia")

    # Campos de identificación separados del resto
    ID_FIELDS = {"taxonId", "scientificName", "dateIdentified", "typeStatus", "isVerified", "identifiers"}

    update_data = payload.model_dump(exclude=ID_FIELDS, exclude_unset=True)

    for field, value in update_data.items():
        setattr(occ, field, value)

    # Recalcular year/month/day si cambió eventDate y no se enviaron explícitamente
    if "eventDate" in update_data and payload.eventDate:
        if "year" not in update_data:
            _apply_event_date_ymd(occ, payload.eventDate)

    # Actualizar identificación vigente si se envió algún campo de identificación
    ident_sent = any(
        getattr(payload, f, None) is not None
        for f in ("taxonId", "scientificName", "dateIdentified", "typeStatus", "isVerified", "identifiers")
    )
    if ident_sent:
        if occ.currentIdentificationId:
            # Actualizar la identificación vigente existente
            current_ident = db.scalar(
                select(Identification).where(Identification.identificationId == occ.currentIdentificationId)
            )
            if current_ident:
                if payload.taxonId is not None:
                    taxon_obj = db.scalar(select(Taxon).where(Taxon.taxonId == payload.taxonId))
                    if not taxon_obj:
                        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Taxon no encontrado")
                    current_ident.taxonId = payload.taxonId
                if payload.scientificName is not None:
                    current_ident.scientificName = payload.scientificName
                if payload.dateIdentified is not None:
                    current_ident.dateIdentified = payload.dateIdentified
                if payload.typeStatus is not None:
                    current_ident.typeStatus = payload.typeStatus
                if payload.isVerified is not None:
                    current_ident.isVerified = payload.isVerified

                if payload.identifiers is not None:
                    # Reemplazar identificadores: borrar los viejos y crear los nuevos
                    db.execute(
                        delete(Identifier).where(
                            Identifier.identificationId == current_ident.identificationId
                        )
                    )
                    for idn in payload.identifiers:
                        name = idn.name.strip()
                        if name:
                            db.add(Identifier(identificationId=current_ident.identificationId, fullName=name, orcID=idn.orcid or None))

                db.add(current_ident)
        else:
            # No hay identificación vigente: crear una nueva
            if payload.scientificName or payload.taxonId:
                if payload.taxonId:
                    taxon_obj = db.scalar(select(Taxon).where(Taxon.taxonId == payload.taxonId))
                    if not taxon_obj:
                        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Taxon no encontrado")

                new_ident = Identification(
                    occurrenceId=occ.occurrenceId,
                    taxonId=payload.taxonId,
                    scientificName=payload.scientificName,
                    dateIdentified=payload.dateIdentified,
                    typeStatus=payload.typeStatus,
                    isCurrent=True,
                    isVerified=payload.isVerified or False,
                )
                db.add(new_ident)
                db.flush()

                for idn in (payload.identifiers or []):
                    name = idn.name.strip()
                    if name:
                        db.add(Identifier(identificationId=new_ident.identificationId, fullName=name, orcID=idn.orcid or None))

                occ.currentIdentificationId = new_ident.identificationId
                db.add(occ)

    db.add(occ)
    db.commit()
    db.refresh(occ)

    return _load_occurrence_full(db, occ.occurrenceId)


def add_identification(
    db: Session, occurrence_id: UUID, payload: IdentificationCreateIn, current_user: User
) -> Occurrence:
    occ = _load_occurrence_with_collection(db, occurrence_id)
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")
    if not occ.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not user_can_edit_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para editar esta ocurrencia")

    if payload.taxonId:
        taxon_obj = db.scalar(select(Taxon).where(Taxon.taxonId == payload.taxonId))
        if not taxon_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Taxon no encontrado")

    # If setAsCurrent, mark all existing identifications as not current
    if payload.setAsCurrent:
        db.execute(
            select(Identification).where(Identification.occurrenceId == occurrence_id)
        )
        for ident in db.execute(
            select(Identification).where(Identification.occurrenceId == occurrence_id)
        ).scalars().all():
            ident.isCurrent = False
            db.add(ident)

    new_ident = Identification(
        occurrenceId=occurrence_id,
        taxonId=payload.taxonId,
        scientificName=payload.scientificName,
        dateIdentified=payload.dateIdentified,
        typeStatus=payload.typeStatus,
        isCurrent=payload.setAsCurrent or not occ.currentIdentificationId,
        isVerified=payload.isVerified or False,
    )
    db.add(new_ident)
    db.flush()

    for idn in (payload.identifiers or []):
        name = idn.name.strip()
        if name:
            db.add(Identifier(identificationId=new_ident.identificationId, fullName=name, orcID=idn.orcid or None))

    if new_ident.isCurrent:
        occ.currentIdentificationId = new_ident.identificationId
        db.add(occ)

    db.commit()
    return _load_occurrence_full(db, occurrence_id)


def delete_identification(
    db: Session, occurrence_id: UUID, identification_id: UUID, current_user: User
) -> Occurrence:
    occ = _load_occurrence_with_collection(db, occurrence_id)
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")
    if not occ.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not user_can_edit_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para editar esta ocurrencia")

    ident = db.scalar(
        select(Identification).where(
            (Identification.identificationId == identification_id)
            & (Identification.occurrenceId == occurrence_id)
        )
    )
    if not ident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identification not found")

    was_current = ident.isCurrent
    db.execute(delete(Identifier).where(Identifier.identificationId == identification_id))
    db.delete(ident)

    if was_current:
        occ.currentIdentificationId = None
        db.add(occ)

    db.commit()
    return _load_occurrence_full(db, occurrence_id)


def set_current_identification(
    db: Session, occurrence_id: UUID, identification_id: UUID, current_user: User
) -> Occurrence:
    occ = _load_occurrence_with_collection(db, occurrence_id)
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")
    if not occ.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not user_can_edit_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para editar esta ocurrencia")

    target_ident = None
    for ident in db.execute(
        select(Identification).where(Identification.occurrenceId == occurrence_id)
    ).scalars().all():
        if ident.identificationId == identification_id:
            ident.isCurrent = True
            target_ident = ident
        else:
            ident.isCurrent = False
        db.add(ident)

    if not target_ident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Identification not found")

    occ.currentIdentificationId = identification_id
    db.add(occ)
    db.commit()

    return _load_occurrence_full(db, occurrence_id)


def set_dynamic_properties(
    db: Session, occurrence_id: UUID, payload: DynamicPropsIn, current_user: User
) -> Occurrence:
    occ = _load_occurrence_full(db, occurrence_id)
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")

    if not occ.collection:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied (occurrence without collection)",
        )

    if not user_can_edit_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough privileges")

    # Normalizar entrada a dict o None
    dp = payload.dynamicProperties
    obj: Optional[Dict[str, Any]] = None

    if isinstance(dp, dict):
        obj = dp
    elif isinstance(dp, str):
        s = dp.strip()
        if s:
            try:
                parsed = json.loads(s)
                if not isinstance(parsed, dict):
                    raise ValueError("dynamicProperties debe ser un objeto JSON")
                obj = parsed
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="dynamicProperties no es un JSON válido",
                )
        else:
            obj = None
    else:
        obj = None

    occ.dynamicProperties = obj

    db.add(occ)
    db.commit()
    db.refresh(occ)

    return occ
