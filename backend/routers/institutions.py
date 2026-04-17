# backend/routers/institutions.py
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_, literal

from backend.config.database import get_db
from backend.models.models import Institution, User
from backend.auth.jwt import get_current_user

from backend.schemas.common.pages import Page
from backend.schemas.institutions import (
    InstitutionOut,
    InstitutionCreate,
    InstitutionUpdate,
)

router = APIRouter(prefix="/institutions", tags=["Institutions"])


@router.get(
    "",
    response_model=Page[InstitutionOut],
    summary="Listar instituciones con paginación",
)
def list_institutions(
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    name_prefix: Optional[str] = Query(
        None,
        alias="namePrefix",  # <-- para que ?namePrefix=... funcione
        description="Filtro por nombre de institución (contiene, case/accent-insensitive)",
    ),
):
    where_clauses = []

    norm_name = func.unaccent(
        func.lower(func.coalesce(Institution.institutionName, ""))
    )

    if name_prefix:
        q = name_prefix.strip().lower()
        contains_pattern = f"%{q}%"
        where_clauses.append(
            norm_name.ilike(func.unaccent(func.lower(literal(contains_pattern))))
        )

    # ---- Total
    count_stmt = select(func.count()).select_from(Institution)
    if where_clauses:
        count_stmt = count_stmt.where(and_(*where_clauses))
    total = db.scalar(count_stmt) or 0

    # ---- Query principal
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

    stmt = stmt.order_by(*order_by_columns).limit(limit).offset(offset)

    institutions = db.scalars(stmt).all()

    # ---- Métricas de página (usa el schema Page con currentPage)
    current_page = (offset // limit) + 1 if limit else 1
    total_pages = (total + limit - 1) // limit if limit else 1
    remaining_pages = max(0, total_pages - current_page)

    return Page[InstitutionOut](
        items=institutions,
        total=total,
        limit=limit,
        offset=offset,
        currentPage=current_page,
        totalPages=total_pages,
        remainingPages=remaining_pages,
    )


@router.get(
    "/{institution_id}",
    response_model=InstitutionOut,
    summary="Obtener institución por id",
)
def get_institution_by_id(
    institution_id: UUID,
    db: Session = Depends(get_db),
):
    stmt = select(Institution).where(Institution.institutionId == institution_id)
    inst = db.scalars(stmt).first()
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institution not found",
        )
    return inst


@router.post(
    "",
    response_model=InstitutionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una nueva institución",
)
def create_institution(
    institution: InstitutionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.isSuperuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the global administrator can create a new institution",
        )

    new_institution = Institution(
        institutionName=institution.institutionName,
        country=institution.country,
        city=institution.city,
        address=institution.address,
        email=institution.email,
        phone=institution.phone,
        webSite=institution.webSite,
        institutionAdminUserId=None,
    )

    db.add(new_institution)
    db.commit()
    db.refresh(new_institution)
    return new_institution


@router.patch(
    "/{institution_id}",
    response_model=InstitutionOut,
    summary="Actualizar información de una institución (parcial)",
)
def update_institution(
    institution_id: UUID,
    institution: InstitutionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1) Cargar institución
    institution_db = db.execute(
        select(Institution).where(Institution.institutionId == institution_id)
    ).scalar_one_or_none()

    if not institution_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institución no encontrada",
        )

    # 2) Autorización
    if current_user.isSuperuser:
        # Superadmin puede modificar cualquier institución,
        # con la lógica especial para institutionAdminUserId más abajo.
        pass
    elif current_user.isInstitutionAdmin:
        # Admin de institución solo puede modificar su propia institución
        if institution_id != current_user.institutionId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "No tienes permisos para modificar una institución "
                    "diferente a la tuya"
                ),
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para modificar la institución",
        )

    # 3) Datos enviados (solo campos presentes en el payload)
    update_data = institution.model_dump(exclude_unset=True)

    # ---- Campos simples
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

    # ---- Cambio de administrador (si fue enviado)
    if "institutionAdminUserId" in update_data:
        new_admin_id: Optional[int] = update_data["institutionAdminUserId"]
        old_admin_id: Optional[int] = institution_db.institutionAdminUserId

        # Regla: el superadmin no puede cambiar el admin de su propia institución
        if current_user.isSuperuser and institution_id == current_user.institutionId:
            if new_admin_id != old_admin_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        "El superadmin no puede modificar el administrador "
                        "de su propia institución"
                    ),
                )

        # Regla: un institution admin no puede cambiar su propio adminId
        if (
            current_user.isInstitutionAdmin
            and institution_db.institutionAdminUserId == current_user.userId
            and new_admin_id != old_admin_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "No puedes modificar tu propio campo "
                    "'institutionAdminUserId'"
                ),
            )

        if new_admin_id == old_admin_id:
            # No hay cambios reales
            pass
        else:
            # a) Si hay un admin actual y se cambia o desasigna → degradar al anterior
            if old_admin_id is not None and old_admin_id != new_admin_id:
                old_admin = db.execute(
                    select(User).where(User.userId == old_admin_id)
                ).scalar_one_or_none()
                if old_admin:
                    old_admin.isInstitutionAdmin = False

            # b) Si se asigna un nuevo admin (entero)
            if new_admin_id is not None:
                new_admin = db.execute(
                    select(User).where(User.userId == new_admin_id)
                ).scalar_one_or_none()
                if not new_admin:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="El usuario indicado como administrador no existe",
                    )

                new_admin.isInstitutionAdmin = True
                new_admin.institutionId = institution_db.institutionId
                institution_db.institutionAdminUserId = new_admin_id
            else:
                # c) Si se envía None -> quitar admin
                institution_db.institutionAdminUserId = None

    db.commit()
    db.refresh(institution_db)

    return institution_db
