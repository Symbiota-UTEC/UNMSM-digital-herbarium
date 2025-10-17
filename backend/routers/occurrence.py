# backend/routers/occurrence.py
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from backend.config.database import get_db
from backend.models.models import Occurrence

from backend.auth.jwt import get_current_user, get_current_payload

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
