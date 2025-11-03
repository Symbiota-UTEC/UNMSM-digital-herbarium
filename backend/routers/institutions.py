# routers/institutions.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_

from backend.config.database import get_db
from backend.models.models import Institution, User
from backend.auth.jwt import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/institutions", tags=["institutions"])


class AdminUserOut(BaseModel):
    id: int
    username: str
    email: str

    class Config:
        orm_mode = True


class InstitutionOut(BaseModel):
    id: int
    institutionID: Optional[str]
    institutionCode: Optional[str]
    institutionName: Optional[str]
    country: Optional[str]
    city: Optional[str]
    address: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    webSite: Optional[str]
    institution_admin_user_id: Optional[int] = None  # Mantener como None hasta asignarlo manualmente
    usersCount: Optional[int] = 0
    admin_user: Optional[
        AdminUserOut] = None  # Esto puede ser útil para mostrar más detalles del admin cuando se asigna

    class Config:
        orm_mode = True


class InstitutionPageOut(BaseModel):
    items: List[InstitutionOut]
    total: int
    limit: int
    offset: int
    current_page: int
    total_pages: int
    remaining_pages: int

class InstitutionCreate(BaseModel):
    institutionID: Optional[str]
    institutionCode: Optional[str]
    institutionName: str
    country: Optional[str]
    city: Optional[str]
    address: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    webSite: Optional[str]
    institution_admin_user_id: Optional[int] = None

    class Config:
        orm_mode = True


from sqlalchemy import select, func, and_

@router.get(
    "",
    response_model=InstitutionPageOut,
    summary="List all institutions with pagination",
)
def list_institutions(
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),

    name_prefix: Optional[str] = Query(
        None,
        description="Prefijo de búsqueda por nombre de institución (case/accent-insensitive)"
    ),
):
    where_clauses = []

    if name_prefix:
        pattern = f"{name_prefix}%"
        where_clauses.append(
            func.unaccent(func.coalesce(Institution.institutionName, "")).ilike(
                func.unaccent(pattern)
            )
        )

    count_stmt = select(func.count()).select_from(Institution)
    if where_clauses:
        count_stmt = count_stmt.where(and_(*where_clauses))
    total = db.scalar(count_stmt) or 0

    stmt = (
        select(Institution)
        .order_by(Institution.institutionName.nulls_last())
        .limit(limit)
        .offset(offset)
    )
    if where_clauses:
        stmt = stmt.where(and_(*where_clauses))

    institutions = db.scalars(stmt).all()

    current_page = (offset // limit) + 1 if limit else 1
    total_pages = (total + limit - 1) // limit if limit else 1
    remaining_pages = max(0, total_pages - current_page)

    return {
        "items": institutions,
        "total": total,
        "limit": limit,
        "offset": offset,
        "current_page": current_page,
        "total_pages": total_pages,
        "remaining_pages": remaining_pages,
    }


@router.get("/{institution_id}", response_model=InstitutionOut, summary="Get institution by id")
def get_institution_by_id(institution_id: int, db: Session = Depends(get_db)):
    stmt = select(Institution).where(Institution.id == institution_id)
    inst = db.scalars(stmt).first()
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institution not found",
        )
    return inst


@router.post("", response_model=InstitutionOut, summary="Create a new institution")
def create_institution(
        institution: InstitutionCreate,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the global administrator can create a new institution",
        )

    new_institution_id = f"urn:uuid:{institution.institutionID}"
    new_institution = Institution(
        institutionID= new_institution_id,
        institutionCode=institution.institutionCode,
        institutionName=institution.institutionName,
        country=institution.country,
        city=institution.city,
        address=institution.address,
        email=institution.email,
        phone=institution.phone,
        webSite=institution.webSite,
        institution_admin_user_id=None,
    )

    db.add(new_institution)
    db.commit()
    db.refresh(new_institution)
    return new_institution


@router.patch("/{institution_id}", response_model=InstitutionOut, summary="Update institution information")
def update_institution(
    institution_id: int,
    institution: InstitutionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1) Cargar institución
    institution_db = db.execute(
        select(Institution).where(Institution.id == institution_id)
    ).scalar_one_or_none()

    if not institution_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institución no encontrada",
        )

    # Superadmin puede modificar cualquier institución, excepto la suya propia
    if current_user.is_superuser:
        if institution_id == current_user.institution_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El superadmin no puede modificar su propia institución",
            )
    # Admin de institución solo puede modificar su propia institución
    elif current_user.is_institution_admin:
        if institution_id != current_user.institution_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para modificar una institución diferente a la tuya",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para modificar la institución",
        )

    # Evitar que el admin de la institución cambie su propio campo
    if institution_db.institution_admin_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes modificar tu propio campo 'institution_admin_user_id'",
        )

    # para distinguir si institution_admin_user_id fue enviado o no
    update_data = institution.model_dump(exclude_unset=True)

    if "institutionID" in update_data:
        institution_db.institutionID = update_data["institutionID"]
    if "institutionCode" in update_data:
        institution_db.institutionCode = update_data["institutionCode"]
    if "institutionName" in update_data:
        institution_db.institutionName = update_data["institutionName"]
    if "country" in update_data:
        institution_db.country = update_data["country"]
    if "city" in update_data:
        institution_db.city = update_data["city"]
    if "address" in update_data:
        institution_db.address = update_data["address"]
    if "email" in update_data:
        institution_db.email = update_data["email"]
    if "phone" in update_data:
        institution_db.phone = update_data["phone"]
    if "webSite" in update_data:
        institution_db.webSite = update_data["webSite"]

    if "institution_admin_user_id" in update_data:
        new_admin_id: Optional[int] = update_data["institution_admin_user_id"]
        old_admin_id: Optional[int] = institution_db.institution_admin_user_id

        # a) Si hay un admin actual y está cambiando o se desasigna, "degradar" al admin anterior
        if old_admin_id is not None and old_admin_id != new_admin_id:
            old_admin = db.execute(
                select(User).where(User.id == old_admin_id)
            ).scalar_one_or_none()
            if old_admin:
                old_admin.is_institution_admin = False

        # b) Si se asigna un nuevo admin (entero)
        if new_admin_id is not None:
            new_admin = db.execute(
                select(User).where(User.id == new_admin_id)
            ).scalar_one_or_none()
            if not new_admin:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="El usuario indicado como administrador no existe",
                )

            new_admin.is_institution_admin = True
            new_admin.institution_id = institution_db.id

            institution_db.institution_admin_user_id = new_admin_id

        if new_admin_id is None:
            institution_db.institution_admin_user_id = None

    db.commit()
    db.refresh(institution_db)

    return institution_db
