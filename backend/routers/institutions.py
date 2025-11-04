# routers/institutions.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_, literal

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
        description="Filtro por nombre de institución (contiene, case/accent-insensitive)"
    ),
):
    where_clauses = []

    norm_name = func.unaccent(func.lower(func.coalesce(Institution.institutionName, "")))

    if name_prefix:
        q = name_prefix.strip().lower()
        contains_pattern = f"%{q}%"
        where_clauses.append(
            norm_name.ilike(func.unaccent(func.lower(literal(contains_pattern))))
        )

    count_stmt = select(func.count()).select_from(Institution)
    if where_clauses:
        count_stmt = count_stmt.where(and_(*where_clauses))
    total = db.scalar(count_stmt) or 0

    stmt = select(Institution)
    if where_clauses:
        stmt = stmt.where(and_(*where_clauses))

    order_by_columns = []
    if name_prefix:
        q = name_prefix.strip().lower()

        startswith_pattern = f"{q}%"
        order_by_columns.append(
            norm_name.ilike(func.unaccent(literal(startswith_pattern))).desc()
        )

        pos_expr = func.strpos(norm_name, func.unaccent(literal(q)))
        order_by_columns.append(pos_expr.asc())

        order_by_columns.append(func.length(norm_name).asc())

    order_by_columns.append(Institution.institutionName.asc().nulls_last())

    stmt = (
        stmt.order_by(*order_by_columns)
            .limit(limit)
            .offset(offset)
    )

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

    if current_user.is_superuser:
        # Superadmin puede modificar su propia institución,
        # sin modificar el institution_admin_user_id.
        pass
    elif current_user.is_institution_admin:
        # Admin de institución solo puede modificar su propia institución
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

    # para distinguir si institution_admin_user_id fue enviado o no
    update_data = institution.model_dump(exclude_unset=True)

    # ---- Campos simples
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

    # ---- Cambio de administrador (si fue enviado)
    if "institution_admin_user_id" in update_data:
        new_admin_id: Optional[int] = update_data["institution_admin_user_id"]
        old_admin_id: Optional[int] = institution_db.institution_admin_user_id

        if current_user.is_superuser and institution_id == current_user.institution_id:
            # si intenta cambiar (a otro id o a None), bloquear
            if new_admin_id != old_admin_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="El superadmin no puede modificar el administrador de su propia institución",
                )

        if (
            current_user.is_institution_admin
            and institution_db.institution_admin_user_id == current_user.id
            and new_admin_id != old_admin_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes modificar tu propio campo 'institution_admin_user_id'",
            )

        if new_admin_id == old_admin_id:
            pass
        else:
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
            else:
                # c) Si se envía None -> quitar admin
                institution_db.institution_admin_user_id = None

    db.commit()
    db.refresh(institution_db)

    return institution_db
