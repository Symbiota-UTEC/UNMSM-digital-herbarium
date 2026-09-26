from __future__ import annotations

from uuid import UUID

# backend/routers/upload/taxon_flora.py
from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile, status
from sqlalchemy.orm import Session

from backend.auth.jwt import require_superuser
from backend.config.database import get_db
from backend.models.models import User
from backend.schemas.common.pages import Page
from backend.schemas.upload import TaxonFloraImportJobOut, TaxonFloraUploadAcceptedOut
from backend.services import taxon_flora_import as taxon_flora_service

router = APIRouter(tags=["Files"])


@router.get(
    "/taxon-flora-csv/jobs",
    response_model=Page[TaxonFloraImportJobOut],
    summary="Lista los trabajos de importación del backbone Taxon (paginado).",
)
def list_taxon_flora_import_jobs(
    page: int = Query(1, ge=1, description="Número de página (1-based)"),
    page_size: int = Query(10, ge=1, le=100, alias="pageSize", description="Tamaño de página"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    del current_user
    return taxon_flora_service.list_taxon_flora_import_jobs(db, page, page_size)


@router.get(
    "/taxon-flora-csv/jobs/{job_id}",
    response_model=TaxonFloraImportJobOut,
    summary="Obtiene el estado actual de un trabajo de importación del backbone Taxon.",
)
def get_taxon_flora_import_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    del current_user
    return taxon_flora_service.get_taxon_flora_import_job(db, job_id)


@router.post(
    "/taxon-flora-csv",
    status_code=status.HTTP_202_ACCEPTED,
    summary="(Async) Carga/actualiza el backbone Taxon (flora) desde un CSV tabulado",
    response_model=TaxonFloraUploadAcceptedOut,
)
async def upload_taxon_flora_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(
        ...,
        description=(
            "CSV de flora (extensión .csv) separado por tabulaciones, con cabeceras que "
            "coinciden con atributos del modelo Taxon (incluyendo 'taxonID')."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superuser),
):
    """
    Versión asíncrona:
    - Valida extensión y guarda el archivo en disco por chunks.
    - Agenda un BackgroundTask que:
        * Marca todos los Taxon como isCurrent = False.
        * Recorre el CSV tabulado.
        * Inserta/actualiza Taxon usando taxonID como clave.
    - Retorna inmediatamente con 202 Accepted.
    """
    return await taxon_flora_service.upload_taxon_flora_csv(
        db, background_tasks, file, current_user
    )
