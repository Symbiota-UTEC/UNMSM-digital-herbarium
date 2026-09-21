from __future__ import annotations

# backend/routers/occurrence.py
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.auth.jwt import get_current_user
from backend.config.database import get_db
from backend.models.models import User
from backend.schemas import Page
from backend.schemas.occurrence import (
    DynamicPropsIn,
    IdentificationCreateIn,
    OccurrenceBriefItem,
    OccurrenceCreateIn,
    OccurrenceFilters,
    OccurrenceMapOut,
    OccurrenceOut,
    OccurrenceUpdateIn,
)
from backend.services import occurrences as occurrences_service
from backend.services.occurrence_filters import get_occurrence_filters

router = APIRouter(
    prefix="/occurrences",
    tags=["Occurrences"],
)


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
    occ = occurrences_service.create_occurrence(db, payload, current_user)
    return occurrences_service.to_occurrence_out(db, occ, current_user)


@router.get(
    "/map",
    response_model=OccurrenceMapOut,
    summary="Puntos de ocurrencias para el mapa, con búsqueda por radio o polígono",
)
def list_occurrence_map_points(
    collection_id: Optional[UUID] = Query(
        None, description="Filtrar por ID de colección específico"
    ),
    limit: int = Query(5000, ge=1, le=20000, description="Máximo de puntos a devolver"),
    filters: OccurrenceFilters = Depends(get_occurrence_filters),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mismos filtros que `GET /occurrences`, pero devuelve los puntos sin paginar
    (hasta `limit`; `truncated` indica si hubo más). Con un área (radio o polígono)
    trae toda muestra cuya ubicación —punto, círculo de incertidumbre o polígono— la
    toque; sin área, todas las que tengan coordenadas. Cada punto trae `fullyContained`
    (None sin área) para distinguir lo que el área contiene por completo de lo que
    solo toca.
    """
    return occurrences_service.list_occurrence_map_points(
        db, collection_id, filters, current_user, limit
    )


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
    occ = occurrences_service.get_occurrence_by_id(db, occurrence_id, current_user)
    return occurrences_service.to_occurrence_out(db, occ, current_user)


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
    return occurrences_service.list_occurrences_basic(
        db, page, page_size, collection_id, filters, current_user
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
    occ = occurrences_service.update_occurrence(db, occurrence_id, payload, current_user)
    return occurrences_service.to_occurrence_out(db, occ, current_user)


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
    occ = occurrences_service.add_identification(db, occurrence_id, payload, current_user)
    return occurrences_service.to_occurrence_out(db, occ, current_user)


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
    occ = occurrences_service.delete_identification(
        db, occurrence_id, identification_id, current_user
    )
    return occurrences_service.to_occurrence_out(db, occ, current_user)


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
    occ = occurrences_service.set_current_identification(
        db, occurrence_id, identification_id, current_user
    )
    return occurrences_service.to_occurrence_out(db, occ, current_user)


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
    occ = occurrences_service.set_dynamic_properties(db, occurrence_id, payload, current_user)
    return occurrences_service.to_occurrence_out(db, occ, current_user)
