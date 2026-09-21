from __future__ import annotations

from uuid import UUID

# backend/routers/upload/images.py
from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from backend.auth.jwt import get_current_user
from backend.config.database import get_db
from backend.models.models import User
from backend.services import images as images_service

router = APIRouter(tags=["Files"])


@router.post(
    "/image",
    status_code=status.HTTP_201_CREATED,
    summary="Subir una imagen y asociarla a una Occurrence a través de SeaweedFS",
)
def upload_image_seaweedfs(
    occurrence_id: UUID = Form(..., description="ID de la Ocurrencia destino"),
    file: UploadFile = File(..., description="Archivo de imagen"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sube una imagen al cluster de SeaweedFS y crea un OccurrenceImage."""
    return images_service.upload_image(db, occurrence_id, file, current_user)


@router.delete(
    "/image/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una imagen por su ID",
)
def delete_image(
    image_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    images_service.delete_image(db, image_id, current_user)


@router.get(
    "/image/{image_id}",
    summary="Descargar u obtener una imagen por su ID",
)
def get_image_seaweedfs(
    image_id: UUID,
    db: Session = Depends(get_db),
):
    """Obtiene una imagen de SeaweedFS consultando su ruta original mediante el OccurrenceImage ID"""
    return images_service.get_image(db, image_id)
