from __future__ import annotations
from uuid import UUID
# backend/routers/upload/images.py

import logging
import uuid

import requests

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.config.database import get_db
from backend.config.settings import seaweedfs_internal_url, seaweedfs_public_url
from backend.auth.jwt import get_current_user
from backend.models.models import User, Occurrence, OccurrenceImage
from backend.services.collection_permissions import user_can_edit_collection

logger = logging.getLogger(__name__)

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
    """
    Sube una imagen al cluster de SeaweedFS y crea un OccurrenceImage.
    """

    occurrence = db.scalar(select(Occurrence).where(Occurrence.occurrenceId == occurrence_id))
    if not occurrence:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Occurrence not found"
        )

    if not user_can_edit_collection(db, current_user, occurrence.collection):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para editar esta colección",
        )

    # 1. Subir imagen a SeaweedFS Filer (en herbarium_seaweedfs:8888)
    try:
        institution_name = "UnknownInstitution"
        collection_id = "UnknownCollection"
        catalog_number = occurrence.catalogNumber or "UnknownCatalog"

        if occurrence.collection:
            collection_id = str(occurrence.collection.collectionId) if occurrence.collection.collectionId else "UnknownCollection"
            if occurrence.collection.institution:
                institution_name = occurrence.collection.institution.institutionName or "UnknownInstitution"

        # Sanitizar rutas para URL
        institution_name_safe = institution_name.replace(" ", "_").replace("/", "-")
        collection_id_safe = collection_id.replace(" ", "_").replace("/", "-")
        catalog_number_safe = catalog_number.replace(" ", "_").replace("/", "-")

        safe_filename = file.filename.replace(" ", "_")
        unique_filename = f"{uuid.uuid4()}_{safe_filename}"

        image_path = f"/images/{institution_name_safe}/{collection_id_safe}/{catalog_number_safe}/{unique_filename}"
        upload_url = f"{seaweedfs_internal_url}{image_path}"

        files = {"file": (file.filename, file.file, file.content_type)}
        upload_res = requests.post(upload_url, files=files)
        upload_res.raise_for_status()

        # Filer devuelve información json sobre la carga
        upload_data = upload_res.json()
        file_size = upload_data.get("size", 0)
    except Exception as e:
        logger.error(f"Error subiendo imagen a SeaweedFS Filer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error copiando el archivo al servidor de archivos (Filer)",
        )

    # 2. Guardar en Base de Datos
    occ_img = OccurrenceImage(
        occurrenceId=occurrence.occurrenceId,
        imagePath=image_path,
        fileSize=file_size,
        photographer=current_user.fullName or current_user.username
    )

    db.add(occ_img)
    db.commit()
    db.refresh(occ_img)

    return {
        "status": "ok",
        "occurrenceImageId": occ_img.occurrenceImageId,
        "occurrenceId": occurrence.occurrenceId,
        "imagePath": image_path,
        "size": file_size,
        "publicUrl": f"{seaweedfs_public_url}{image_path}"
    }


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
    image = db.scalar(select(OccurrenceImage).where(OccurrenceImage.occurrenceImageId == image_id))
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    # Load occurrence + collection for permission check
    occurrence = db.scalar(
        select(Occurrence)
        .options(selectinload(Occurrence.collection))
        .where(Occurrence.occurrenceId == image.occurrenceId)
    )
    if not occurrence or not occurrence.collection:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if not user_can_edit_collection(db, current_user, occurrence.collection):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para eliminar esta imagen")

    # Delete from SeaweedFS
    try:
        delete_url = f"{seaweedfs_internal_url}{image.imagePath}"
        requests.delete(delete_url, timeout=10)
    except Exception as e:
        logger.warning(f"Could not delete image from SeaweedFS: {e}")

    db.delete(image)
    db.commit()


@router.get(
    "/image/{image_id}",
    summary="Descargar u obtener una imagen por su ID",
)
def get_image_seaweedfs(
    image_id: UUID,
    db: Session = Depends(get_db),
):
    """
    Obtiene una imagen de SeaweedFS consultando su ruta original mediante el OccurrenceImage ID
    """
    image = db.scalar(select(OccurrenceImage).where(OccurrenceImage.occurrenceImageId == image_id))
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found"
        )

    # URL interna definida para SeaweedFS en docker network
    download_url = f"http://herbarium_seaweedfs:8888{image.imagePath}"

    try:
        response = requests.get(download_url, stream=True)
        response.raise_for_status()

        return StreamingResponse(
            response.iter_content(chunk_size=1024*1024),
            media_type=response.headers.get("Content-Type", "image/jpeg"),
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"Error downloading image from SeaweedFS: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error downloading image from SeaweedFS"
        )
