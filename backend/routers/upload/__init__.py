# backend/routers/upload/__init__.py
"""
Agrupa los endpoints de /upload, uno por archivo según responsabilidad:
dwc_csv.py (import CSV DwC), taxon_flora.py (import async del backbone Taxon)
e images.py (imágenes vía SeaweedFS).
"""
from fastapi import APIRouter

from backend.routers.upload import dwc_csv, taxon_flora, images

router = APIRouter(prefix="/upload")
router.include_router(dwc_csv.router)
router.include_router(taxon_flora.router)
router.include_router(images.router)

__all__ = ["router"]
