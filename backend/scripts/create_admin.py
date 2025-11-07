# backend/scripts/create_admin.py
from __future__ import annotations
import os
from pathlib import Path
from dotenv import load_dotenv
from uuid import uuid4
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, Mapped
from sqlalchemy.types import String, Text

from backend.config.database import Base, engine, SessionLocal
from backend.models.models import User, Institution, Agent
from backend.utils.security import hash_password

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(ENV_PATH)


def increment_users_count(db: Session, institution: Institution, delta: int = 1) -> None:
    """
    Incrementa (o decrementa si delta<0) el contador de usuarios de la institución.
    Se asegura de inicializar en 0 si es None.
    """
    current = institution.usersCount or 0  # usersCount puede estar en NULL
    institution.usersCount = current + delta
    db.add(institution)
    db.commit()
    db.refresh(institution)


def upsert_institution(db: Session) -> Institution:
    """
    Crea o devuelve la institución objetivo. Usa variables de entorno con
    valores por defecto de la UNMSM.
    """
    institution_code = os.getenv("INSTITUTION_CODE", "UNMSM")
    institution_name = os.getenv("INSTITUTION_NAME", "Universidad Nacional Mayor de San Marcos")
    institution_id_env = os.getenv("INSTITUTION_ID")
    country = os.getenv("INSTITUTION_COUNTRY", "Perú")
    city = os.getenv("INSTITUTION_CITY", "Lima")
    address = os.getenv(
        "INSTITUTION_ADDRESS",
        "Av. Universitaria 1801, San Miguel, Lima, Perú"
    )
    email = os.getenv("INSTITUTION_EMAIL", None)
    phone = os.getenv("INSTITUTION_PHONE", None)
    website = os.getenv("INSTITUTION_WEBSITE", "https://www.unmsm.edu.pe/")

    inst = db.execute(
        select(Institution).where(Institution.institutionCode == institution_code)
    ).scalar_one_or_none()

    if inst:
        changed = False
        if not inst.institutionName and institution_name:
            inst.institutionName = institution_name; changed = True
        if not inst.country and country:
            inst.country = country; changed = True
        if not inst.city and city:
            inst.city = city; changed = True
        if not inst.address and address:
            inst.address = address; changed = True
        if not inst.email and email:
            inst.email = email; changed = True
        if not inst.phone and phone:
            inst.phone = phone; changed = True
        if not inst.webSite and website:
            inst.webSite = website; changed = True
        if not inst.institutionID:
            inst.institutionID = institution_id_env or f"urn:uuid:{uuid4()}"; changed = True

        if changed:
            db.add(inst)
            db.commit()
            db.refresh(inst)
        print(f"[bootstrap] Institution '{institution_code}' ready (id={inst.id}).")
        return inst

    inst = Institution(
        institutionID=institution_id_env or f"urn:uuid:{uuid4()}",
        institutionCode=institution_code,
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
    print(f"[bootstrap] Created institution '{institution_code}' (id={inst.id}).")
    return inst


def upsert_agent(db: Session):
    agent_id = "urn:uuid:dc302821-eb93-4aee-819f-04413f627bc3"
    given_name = "Gisella"
    family_name = "Orjeda"
    full_name = f"{given_name} {family_name}"
    orcid = "0000-0003-3013-5523"
    phone: Mapped[Optional[String]] = "+51 999999999"
    address: Mapped[Optional[Text]] = "Av. Universitaria 1801, San Miguel, Lima, Perú"

    agent = db.execute(
        select(Agent).where(Agent.agentID == agent_id)
    ).scalar_one_or_none()

    if agent:
        return agent

    agent = Agent(
        agentID=agent_id,
        givenName=given_name,
        familyName=family_name,
        fullName=full_name,
        orcid=orcid,
        phone=phone,
        address=address,
    )

    db.add(agent)
    db.commit()
    db.refresh(agent)
    print(f"[bootstrap] Agent '{agent_id}' ready (id={agent.id}).")
    return agent


def upsert_admin(db: Session, institution: Institution, agent: Agent) -> User:
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_email = os.getenv("ADMIN_EMAIL", "admin@gmail.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin")

    user = db.execute(
        select(User).where(User.username == admin_username)
    ).scalar_one_or_none()

    created_user = False

    if user:
        changed = False

        if not user.email and admin_email:
            user.email = admin_email; changed = True

        if not user.is_superuser:
            user.is_superuser = True; changed = True

        if not user.is_active:
            user.is_active = True; changed = True

        if user.institution_id != institution.id:
            user.institution_id = institution.id; changed = True

        if not getattr(user, "is_institution_admin", False):
            user.is_institution_admin = True; changed = True

        if not user.agent_id and agent.id:
            user.agent_id = agent.id; changed = True

        if changed:
            db.add(user)
            db.commit()
            db.refresh(user)

    else:
        user = User(
            username=admin_username,
            email=admin_email,
            hashed_password=hash_password(admin_password),
            is_active=True,
            is_superuser=True,
            is_institution_admin=True,
            institution_id=institution.id,
            agent_id=agent.id,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        created_user = True  # ← se creó el admin

    # Si se creó un usuario nuevo como admin, suma 1 al contador de la institución
    if created_user:
        increment_users_count(db, institution, delta=1)

    # Mantener consistencia del admin asignado en Institution
    prev_inst = db.execute(
        select(Institution).where(
            Institution.institution_admin_user_id == user.id,
            Institution.id != institution.id
        )
    ).scalar_one_or_none()

    if prev_inst:
        prev_inst.institution_admin_user_id = None
        db.add(prev_inst)
        db.commit()
        db.refresh(prev_inst)

    if institution.institution_admin_user_id != user.id:
        institution.institution_admin_user_id = user.id
        db.add(institution)
        db.commit()
        db.refresh(institution)

    print(f"[bootstrap] Admin user '{admin_username}' ready (id={user.id}).")
    return user


def main():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        inst = upsert_institution(db)
        agent = upsert_agent(db)
        upsert_admin(db, inst, agent)
    finally:
        db.close()


if __name__ == "__main__":
    main()
