# backend/routers/admin.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.models.models import User
from backend.auth.jwt import require_admin
from backend.schemas.admin import AdminMetricsOut
from backend.services.admin_metrics import get_admin_metrics

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/metrics", response_model=AdminMetricsOut)
def admin_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> AdminMetricsOut:
    return get_admin_metrics(db, current_user)
