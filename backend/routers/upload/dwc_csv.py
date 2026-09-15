from __future__ import annotations
from uuid import UUID
# backend/routers/upload/dwc_csv.py

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.auth.jwt import get_current_user
from backend.models.models import User
from backend.services import dwc_import as dwc_import_service

router = APIRouter(tags=["Files"])


@router.post(
    "/dwc-csv",
    status_code=status.HTTP_201_CREATED,
    summary="Sube un CSV DwC estricto y lo inserta a una colección",
)
def upload_dwc_csv(
    collection_id: UUID = Form(..., description="ID de la colección destino"),
    file: UploadFile = File(
        ..., description="Archivo CSV (DwC headers: dwc:Entity:field)"
    ),
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
    - A NIVEL DE CABECERA (no por fila) se exigen las columnas:
        * dwc:Occurrence:recordNumber
        * dwc:Occurrence:catalogNumber
        * dwc:Occurrence:recordedBy
        * dwc:Taxon:scientificName
        * dwc:Taxon:scientificNameAuthorship
        * dwc:Identification:identifiedBy
      A NIVEL DE FILA:
        - Ningún valor es obligatorio. Si viene vacío, se deja el atributo como None.
    """
    return dwc_import_service.import_dwc_csv(db, collection_id, file, current_user)
