# backend/services/institutions.py
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, literal, select
from sqlalchemy.orm import Session

from backend.models.models import Institution, User
from backend.schemas.common.pages import Page
from backend.schemas.institutions import InstitutionCreate, InstitutionOut, InstitutionUpdate


def list_institutions(
    db: Session, page: int, page_size: int, name_prefix: Optional[str]
) -> Page[InstitutionOut]:
    limit = page_size
    offset = (page - 1) * page_size

    where_clauses = []

    norm_name = func.unaccent(func.lower(func.coalesce(Institution.institutionName, "")))

    if name_prefix:
        q = name_prefix.strip().lower()
        contains_pattern = f"%{q}%"
        where_clauses.append(norm_name.ilike(func.unaccent(func.lower(literal(contains_pattern)))))

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
        order_by_columns.append(norm_name.ilike(func.unaccent(literal(startswith_pattern))).desc())

        pos_expr = func.strpos(norm_name, func.unaccent(literal(q)))
        order_by_columns.append(pos_expr.asc())

        order_by_columns.append(func.length(norm_name).asc())

    order_by_columns.append(Institution.institutionName.asc().nulls_last())

    stmt = stmt.order_by(*order_by_columns).limit(limit).offset(offset)

    institutions = db.scalars(stmt).all()

    return Page[InstitutionOut].of(institutions, total=total, limit=limit, offset=offset)


def get_institution_by_id(db: Session, institution_id: UUID) -> Institution:
    stmt = select(Institution).where(Institution.institutionId == institution_id)
    inst = db.scalars(stmt).first()
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institution not found",
        )
    return inst


def create_institution(
    db: Session, institution: InstitutionCreate, current_user: User
) -> Institution:
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


def update_institution(
    db: Session,
    institution_id: UUID,
    institution: InstitutionUpdate,
    current_user: User,
) -> Institution:
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
                detail=("No tienes permisos para modificar una institución diferente a la tuya"),
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
                        "El superadmin no puede modificar el administrador de su propia institución"
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
                detail=("No puedes modificar tu propio campo 'institutionAdminUserId'"),
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
