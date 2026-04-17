from __future__ import annotations
from uuid import UUID
# backend/routers/occurrence.py

import json
from datetime import datetime, date
from typing import Optional, Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, delete, exists, or_, func, and_
from sqlalchemy.orm import Session, selectinload

from backend.config.database import get_db
from backend.auth.jwt import get_current_user
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
    OccurrenceOut,
    OccurrenceBriefItem,
    DynamicPropsIn,
    OccurrenceFilters,
    OccurrenceCreateIn,
    OccurrenceUpdateIn,
    IdentificationCreateIn,
)

from backend.services.occurrence_filters import (
    get_occurrence_filters,
    apply_occurrence_filters,
)

router = APIRouter(
    prefix="/occurrences",
    tags=["Occurrences"],
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


def _user_flags(user: User):
    """Pequeño helper para tolerar nombres snake/camel."""
    is_superuser = getattr(user, "isSuperuser", getattr(user, "is_superuser", False))
    is_inst_admin = getattr(
        user, "isInstitutionAdmin", getattr(user, "is_institution_admin", False)
    )
    institution_id = getattr(user, "institutionId", getattr(user, "institution_id", None))
    return is_superuser, is_inst_admin, institution_id


def _user_can_view_collection(db: Session, user: User, collection: Collection) -> bool:
    """
    Reglas:
       - superuser: acceso
       - permiso explícito (viewer/editor/owner): acceso
       - admin de institución y misma institución: acceso
    """
    is_superuser, is_inst_admin, user_inst_id = _user_flags(user)

    if is_superuser:
        return True

    # permiso explícito
    perm_exists = db.scalar(
        select(
            exists().where(
                (CollectionPermission.collectionId == collection.collectionId)
                & (CollectionPermission.userId == user.userId)
            )
        )
    )
    if perm_exists:
        return True

    # admin de la institución que posee la colección
    if is_inst_admin and collection.institutionId and user_inst_id:
        if collection.institutionId == user_inst_id:
            return True

    return False


def _user_can_edit_collection(db: Session, user: User, collection: Collection) -> bool:
    """
    Permisos de edición:
       - superuser
       - admin de la institución dueña
       - rol explícito editor/owner
    """
    is_superuser, is_inst_admin, user_inst_id = _user_flags(user)

    if is_superuser:
        return True

    if is_inst_admin and collection.institutionId and user_inst_id:
        if collection.institutionId == user_inst_id:
            return True

    role = db.scalar(
        select(CollectionPermission.role).where(
            (CollectionPermission.collectionId == collection.collectionId)
            & (CollectionPermission.userId == user.userId)
        )
    )
    return role in ("editor", "owner")


def _page_meta(total: int, limit: int, offset: int) -> tuple[int, int, int]:
    """
    Devuelve (total_pages, current_page, remaining_pages) usando la misma lógica
    que en Collections.
    """
    if limit <= 0:
        return 0, 1, 0

    if total == 0:
        # totalPages = 0, currentPage = 1, remainingPages = 0
        return 0, 1, 0

    total_pages = (total + limit - 1) // limit
    current_page = min(total_pages, (offset // limit) + 1)
    remaining_pages = max(0, total_pages - current_page)
    return total_pages, current_page, remaining_pages



# =========================
# Endpoints
# =========================

@router.post(
    "",
    response_model=OccurrenceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crea una nueva ocurrencia",
)
def create_occurrence(
    payload: OccurrenceCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verificamos que la colección exista y el usuario pueda editarla
    collection = db.scalar(select(Collection).where(Collection.collectionId == payload.collectionId))
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found"
        )
    
    if not _user_can_edit_collection(db, current_user, collection):
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
        try:
            from datetime import date as _date
            parsed = _date.fromisoformat(payload.eventDate)
            occ.year = parsed.year
            occ.month = parsed.month
            occ.day = parsed.day
        except ValueError:
            pass
    
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
    stmt = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.collection),

            selectinload(Occurrence.identifications)
            .selectinload(Identification.identifiers),
            selectinload(Occurrence.identifications)
            .selectinload(Identification.taxon),
        )
        .where(Occurrence.occurrenceId == occ.occurrenceId)
    )
    occ = db.scalar(stmt)
    
    return OccurrenceOut.model_validate(occ, from_attributes=True)


@router.get(
    "/{occurrence_id}",
    response_model=OccurrenceOut,
    status_code=status.HTTP_200_OK,
    summary="Detalle de ocurrencia por ID",
)
def get_occurrence_by_id(
    occurrence_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve una ocurrencia por ID, incluyendo:
    - Campos Occurrence aplanados (Occurrence + Event + Location).
    - Colección asociada.
    - Identificaciones (Identification) + identificadores (Identifier) + taxón.
    """
    stmt = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.collection),

            selectinload(Occurrence.identifications)
            .selectinload(Identification.identifiers),
            selectinload(Occurrence.identifications)
            .selectinload(Identification.taxon),
        )
        .where(Occurrence.occurrenceId == occurrence_id)
    )
    occ = db.scalar(stmt)

    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")

    if not occ.collection:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied (occurrence without collection)",
        )

    if not _user_can_view_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Pydantic v2 con from_attributes=True en OccurrenceOut hace el mapeo completo.
    # Gracias a los serialization_alias en los submodelos, agentID/identifierID salen como "orcid".
    return OccurrenceOut.model_validate(occ, from_attributes=True)


@router.get(
    "",
    response_model=Page[OccurrenceBriefItem],
    summary="Lista de ocurrencias visibles (vista breve) para el usuario actual",
)
def list_occurrences_basic(
    page: int = Query(1, ge=1, description="Número de página (1-based)"),
    page_size: int = Query(50, ge=1, le=200, description="Tamaño de página"),
    collection_id: Optional[UUID] = Query(
        None, description="Filtrar por ID de colección específico"
    ),
    filters: OccurrenceFilters = Depends(get_occurrence_filters),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Vista breve:
    - code: catalogNumber o, si falta, recordNumber.
    - scientificName, family: del taxón de la identificación marcada como isCurrent=True (si existe).
    - location: coalesce(locality, municipality, stateProvince, country).
    - collector: recordedBy.
    - date: eventDate (normalizada a dd/mm/aaaa cuando se puede parsear).
    """
    is_superuser, is_inst_admin, user_inst_id = _user_flags(current_user)

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

    total_pages, current_page, remaining_pages = _page_meta(total, limit, offset)

    return Page[OccurrenceBriefItem](
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        currentPage=current_page,
        totalPages=total_pages,
        remainingPages=remaining_pages,
    )



@router.put(
    "/{occurrence_id}",
    response_model=OccurrenceOut,
    status_code=status.HTTP_200_OK,
    summary="Actualiza una ocurrencia existente",
)
def update_occurrence(
    occurrence_id: UUID,
    payload: OccurrenceUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    occ = db.scalar(stmt)

    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")

    if not occ.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied (occurrence without collection)")

    if not _user_can_edit_collection(db, current_user, occ.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para editar esta ocurrencia")

    # Campos de identificación separados del resto
    ID_FIELDS = {"taxonId", "scientificName", "dateIdentified", "typeStatus", "isVerified", "identifiers"}

    update_data = payload.model_dump(exclude=ID_FIELDS, exclude_unset=True)

    for field, value in update_data.items():
        setattr(occ, field, value)

    # Recalcular year/month/day si cambió eventDate y no se enviaron explícitamente
    if "eventDate" in update_data and payload.eventDate:
        if "year" not in update_data:
            try:
                from datetime import date as _date
                parsed = _date.fromisoformat(payload.eventDate)
                occ.year = parsed.year
                occ.month = parsed.month
                occ.day = parsed.day
            except ValueError:
                pass

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

    stmt = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.collection),
            selectinload(Occurrence.identifications).selectinload(Identification.identifiers),
            selectinload(Occurrence.identifications).selectinload(Identification.taxon),
            selectinload(Occurrence.images),
        )
        .where(Occurrence.occurrenceId == occ.occurrenceId)
    )
    occ = db.scalar(stmt)
    return OccurrenceOut.model_validate(occ, from_attributes=True)


def _reload_occurrence(db: Session, occurrence_id: UUID) -> Occurrence:
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


@router.post(
    "/{occurrence_id}/identifications",
    response_model=OccurrenceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Agrega una nueva identificación a una ocurrencia",
)
def add_identification(
    occurrence_id: UUID,
    payload: IdentificationCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    occ = db.scalar(
        select(Occurrence).options(selectinload(Occurrence.collection))
        .where(Occurrence.occurrenceId == occurrence_id)
    )
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")
    if not occ.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not _user_can_edit_collection(db, current_user, occ.collection):
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
    occ = _reload_occurrence(db, occurrence_id)
    return OccurrenceOut.model_validate(occ, from_attributes=True)


@router.delete(
    "/{occurrence_id}/identifications/{identification_id}",
    response_model=OccurrenceOut,
    status_code=status.HTTP_200_OK,
    summary="Elimina una identificación de una ocurrencia",
)
def delete_identification(
    occurrence_id: UUID,
    identification_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    occ = db.scalar(
        select(Occurrence).options(selectinload(Occurrence.collection))
        .where(Occurrence.occurrenceId == occurrence_id)
    )
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")
    if not occ.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not _user_can_edit_collection(db, current_user, occ.collection):
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
    occ = _reload_occurrence(db, occurrence_id)
    return OccurrenceOut.model_validate(occ, from_attributes=True)


@router.patch(
    "/{occurrence_id}/identifications/{identification_id}/current",
    response_model=OccurrenceOut,
    status_code=status.HTTP_200_OK,
    summary="Establece una identificación como la vigente",
)
def set_current_identification(
    occurrence_id: UUID,
    identification_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    occ = db.scalar(
        select(Occurrence).options(selectinload(Occurrence.collection))
        .where(Occurrence.occurrenceId == occurrence_id)
    )
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")
    if not occ.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not _user_can_edit_collection(db, current_user, occ.collection):
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

    occ = _reload_occurrence(db, occurrence_id)
    return OccurrenceOut.model_validate(occ, from_attributes=True)


@router.patch(
    "/{occurrence_id}/dynamic-properties",
    response_model=OccurrenceOut,
    status_code=status.HTTP_200_OK,
    summary="Actualiza dynamicProperties (JSON) de una ocurrencia",
)
def set_dynamic_properties(
    occurrence_id: UUID,
    payload: DynamicPropsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(Occurrence)
        .options(
            selectinload(Occurrence.collection),

            selectinload(Occurrence.identifications)
            .selectinload(Identification.identifiers),
            selectinload(Occurrence.identifications)
            .selectinload(Identification.taxon),
        )
        .where(Occurrence.occurrenceId == occurrence_id)
    )
    occ = db.scalar(stmt)
    if not occ:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found")

    if not occ.collection:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied (occurrence without collection)",
        )

    if not _user_can_edit_collection(db, current_user, occ.collection):
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

    return OccurrenceOut.model_validate(occ, from_attributes=True)

