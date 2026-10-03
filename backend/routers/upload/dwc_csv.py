from __future__ import annotations

from uuid import UUID

# backend/routers/upload/dwc_csv.py
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from backend.auth.jwt import get_current_user
from backend.config.database import get_db
from backend.models.models import User
from backend.schemas.common.pages import Page
from backend.schemas.upload import DwcImportJobAcceptedOut, DwcImportJobOut
from backend.services import dwc_import as dwc_import_service

router = APIRouter(tags=["Files"])


@router.post(
    "/dwc-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Sube un CSV DwC estricto y lo inserta a una colección",
)
def upload_dwc_csv(
    collection_id: UUID = Form(..., description="ID de la colección destino"),
    file: UploadFile = File(..., description="Archivo CSV (DwC headers: dwc:Entity:field)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    - Valida extensión y contenido CSV.
    - Valida headers estrictos 'dwc:Entity:field'.
    - Inserta Occurrence aplanado (Occurrence + Event + Location).
    - Crea SIEMPRE una Identification por fila con:
        * scientificName y scientificNameAuthorship copiados del bloque Taxon (si vienen).
        * Un taxonId asignado SOLO si se puede resolver un Taxon único
          según la lógica de resolución (backbone ya cargado).
    - Crea Identifier(s) según identifiedBy
      vinculados directamente a la Identification, **solo si vienen nombres/IDs**.
    - Marca la Identification creada como isCurrent = True y la asigna como
      currentIdentification de la Occurrence.
    - Se exige dwc:Occurrence:catalogNumber como cabecera y un valor numérico por fila.
      El valor se recorta, conserva ceros iniciales y debe ser único en la institución.
    """
    return dwc_import_service.import_dwc_csv(db, collection_id, file, current_user)


@router.post(
    "/dwc-csv/jobs",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=DwcImportJobAcceptedOut,
    summary="Inicia una importación DwC en segundo plano",
)
async def create_dwc_csv_import_job(
    background_tasks: BackgroundTasks,
    collection_id: UUID = Form(..., description="ID de la colección destino"),
    file: UploadFile = File(..., description="Archivo CSV Darwin Core"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await dwc_import_service.enqueue_dwc_csv_import(
        db, background_tasks, collection_id, file, current_user
    )


@router.get(
    "/dwc-csv/jobs",
    response_model=Page[DwcImportJobOut],
    summary="Lista importaciones DwC de una colección",
)
def list_dwc_csv_import_jobs(
    collection_id: UUID = Query(..., alias="collectionId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100, alias="pageSize"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return dwc_import_service.list_dwc_import_jobs(db, collection_id, page, page_size, current_user)


@router.get(
    "/dwc-csv/jobs/{job_id}",
    response_model=DwcImportJobOut,
    summary="Obtiene progreso o resultado de una importación DwC",
)
def get_dwc_csv_import_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return dwc_import_service.get_dwc_import_job(db, job_id, current_user)
