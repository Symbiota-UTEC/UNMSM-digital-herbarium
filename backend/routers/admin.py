# routers/admin.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, case
from sqlalchemy.orm import Session
from typing import Dict, Literal, Optional
from pydantic import BaseModel

from backend.config.database import get_db
from backend.models.models import User, Collection, RegistrationRequest, Occurrence
from backend.auth.jwt import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin"])


def require_admin(current_user: User):
    if not (current_user.is_superuser or current_user.is_institution_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para acceder a estas métricas."
        )
    return current_user


class ScopedTotals(BaseModel):
    institution: int
    app: Optional[int] = None  # ← opcional para institution_admin


MetricKey = Literal["collections", "users", "occurrences", "requestsPending"]


class AdminMetricsOut(BaseModel):
    institution_id: int
    metrics: Dict[MetricKey, ScopedTotals]


@router.get("/metrics", response_model=AdminMetricsOut)
def admin_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user = require_admin(current_user)
    inst_id = current_user.institution_id

    def totals(institution_count: int, app_count: Optional[int]) -> Dict[str, int]:
        data = {"institution": institution_count}
        if current_user.is_superuser and app_count is not None:
            data["app"] = app_count
        return data

    if current_user.is_superuser:
        # --- Collections ---
        coll_row = db.execute(
            select(
                func.count(Collection.id).label("app"),
                func.sum(case((Collection.institution_id == inst_id, 1), else_=0)).label("institution"),
            )
        ).one()

        # --- Users ---
        users_row = db.execute(
            select(
                func.count(User.id).label("app"),
                func.sum(case((User.institution_id == inst_id, 1), else_=0)).label("institution"),
            )
        ).one()

        # --- Requests (pending) ---
        req_row = db.execute(
            select(
                func.sum(case((RegistrationRequest.status == "pending", 1), else_=0)).label("app"),
                func.sum(
                    case(
                        (
                            (RegistrationRequest.status == "pending") &
                            (RegistrationRequest.institution_id == inst_id),
                            1
                        ),
                        else_=0
                    )
                ).label("institution"),
            )
        ).one()

        # --- Occurrences ---
        occ_row = db.execute(
            select(
                func.count(Occurrence.id).label("app"),
                func.sum(
                    case((Collection.institution_id == inst_id, 1), else_=0)
                ).label("institution"),
            ).select_from(
                Occurrence.__table__.outerjoin(
                    Collection, Occurrence.collection_id == Collection.id
                )
            )
        ).one()

        collections_totals = totals(coll_row.institution or 0, coll_row.app or 0)
        users_totals       = totals(users_row.institution or 0, users_row.app or 0)
        requests_totals    = totals(req_row.institution or 0, req_row.app or 0)
        occurrences_totals = totals(occ_row.institution or 0, occ_row.app or 0)

    else:
        # Institution admin → solo su institución
        collections_inst = db.scalar(
            select(func.count(Collection.id)).where(Collection.institution_id == inst_id)
        ) or 0

        users_inst = db.scalar(
            select(func.count(User.id)).where(User.institution_id == inst_id)
        ) or 0

        requests_inst = db.scalar(
            select(func.count(RegistrationRequest.id)).where(
                RegistrationRequest.status == "pending",
                RegistrationRequest.institution_id == inst_id,
            )
        ) or 0

        occurrences_inst = db.scalar(
            select(func.count(Occurrence.id))
            .join(Collection, Occurrence.collection_id == Collection.id)
            .where(Collection.institution_id == inst_id)
        ) or 0

        collections_totals = totals(collections_inst, None)
        users_totals       = totals(users_inst, None)
        requests_totals    = totals(requests_inst, None)
        occurrences_totals = totals(occurrences_inst, None)

    return {
        "institution_id": inst_id,
        "metrics": {
            "collections": collections_totals,
            "users": users_totals,
            "requestsPending": requests_totals,
            "occurrences": occurrences_totals,
        },
    }
