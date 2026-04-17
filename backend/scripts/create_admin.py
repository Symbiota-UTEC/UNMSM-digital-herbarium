# backend/scripts/create_admin.py
from __future__ import annotations

import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config.database import Base, engine, SessionLocal
from backend.models.models import User, Institution
from backend.utils.security import hash_password

# Cargamos variables de entorno desde backend/config/.env (si existe)
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR.parent / "config" / ".env"
load_dotenv(ENV_PATH)


def increment_users_count(db: Session, institution: Institution, delta: int = 1) -> None:
    """
    Incrementa (o decrementa si delta<0) el contador de usuarios de la institución.
    Se asegura de inicializar en 0 si es None.
    """
    current = institution.usersCount or 0
    institution.usersCount = current + delta
    db.add(institution)
    db.commit()
    db.refresh(institution)


def upsert_institution(db: Session) -> Institution:
    """
    Crea o devuelve la institución objetivo. Usa variables de entorno con
    valores por defecto de la UNMSM.
    """
    institution_id = os.getenv("INSTITUTION_ID", "ae3fa7bc-6437-4ffb-8e33-ec8935295289")
    institution_name = os.getenv("INSTITUTION_NAME", "Universidad Nacional Mayor de San Marcos")
    website = os.getenv("INSTITUTION_WEBSITE", "https://www.unmsm.edu.pe/")
    country = os.getenv("INSTITUTION_COUNTRY", "Perú")
    city = os.getenv("INSTITUTION_CITY", "Lima")
    address = os.getenv(
        "INSTITUTION_ADDRESS",
        "Av. Universitaria 1801, San Miguel, Lima, Perú",
    )
    email = os.getenv("INSTITUTION_EMAIL")
    phone = os.getenv("INSTITUTION_PHONE")

    inst = db.scalar(
        select(Institution).where(Institution.institutionId == institution_id)
    )

    if inst:
        changed = False
        if not inst.institutionName and institution_name:
            inst.institutionName = institution_name
            changed = True
        if not inst.country and country:
            inst.country = country
            changed = True
        if not inst.city and city:
            inst.city = city
            changed = True
        if not inst.address and address:
            inst.address = address
            changed = True
        if not inst.email and email:
            inst.email = email
            changed = True
        if not inst.phone and phone:
            inst.phone = phone
            changed = True

        if changed:
            db.add(inst)
            db.commit()
            db.refresh(inst)

        print(f"[bootstrap] Institution '{institution_name}' ready (id={inst.institutionId}).")
        return inst

    inst = Institution(
        institutionId=institution_id,
        institutionName=institution_name,
        country=country,
        city=city,
        address=address,
        email=email,
        phone=phone,
        webSite=website,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    print(f"[bootstrap] Created institution '{institution_name}' (id={inst.institutionId}).")
    return inst


def upsert_admin(db: Session, institution: Institution) -> User:
    """
    Crea (o actualiza) un usuario admin global para la institución dada.
    """
    admin_id = os.getenv("ADMIN_ID", "ae3fa7bc-6437-4ffb-8e33-ec8935295280")
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_email = os.getenv("ADMIN_EMAIL", "admin@gmail.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin")

    user = db.scalar(select(User).where(User.username == admin_username))
    created_user = False

    if user:
        changed = False

        if not user.email and admin_email:
            user.email = admin_email
            changed = True

        if not user.isSuperuser:
            user.isSuperuser = True
            changed = True

        if not user.isActive:
            user.isActive = True
            changed = True

        if user.institutionId != institution.institutionId:
            user.institutionId = institution.institutionId
            changed = True

        if not user.isInstitutionAdmin:
            user.isInstitutionAdmin = True
            changed = True

        if changed:
            db.add(user)
            db.commit()
            db.refresh(user)
    else:
        user = User(
            userId=admin_id,
            username=admin_username,
            email=admin_email,
            hashedPassword=hash_password(admin_password),
            isActive=True,
            isSuperuser=True,
            isInstitutionAdmin=True,
            institutionId=institution.institutionId,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        created_user = True

    # Si se creó un usuario nuevo como admin, suma 1 al contador de la institución
    if created_user:
        increment_users_count(db, institution, delta=1)

    # Mantener consistencia del admin asignado en Institution
    prev_inst = db.scalar(
        select(Institution).where(
            Institution.institutionAdminUserId == user.userId,
            Institution.institutionId != institution.institutionId,
        )
    )

    if prev_inst:
        prev_inst.institutionAdminUserId = None
        db.add(prev_inst)
        db.commit()
        db.refresh(prev_inst)

    if institution.institutionAdminUserId != user.userId:
        institution.institutionAdminUserId = user.userId
        db.add(institution)
        db.commit()
        db.refresh(institution)

    print(f"[bootstrap] Admin user '{admin_username}' ready (id={user.userId}).")
    return user


def main():
    # Asegura que todas las tablas existen
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        inst = upsert_institution(db)
        upsert_admin(db, inst)
    finally:
        db.close()


if __name__ == "__main__":
    main()
