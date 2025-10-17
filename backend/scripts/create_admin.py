# backend/scripts/create_admin.py
from __future__ import annotations
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import select
from backend.config.database import get_db, Base, engine, SessionLocal
from backend.models.models import User, Agent
from backend.utils.security import hash_password

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(ENV_PATH)

def main():
    Base.metadata.create_all(bind=engine)

    admin_username = os.getenv("ADMIN_USERNAME")
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")

    db = SessionLocal()
    try:
        existing = db.execute(select(User).where(User.username == admin_username)).scalar_one_or_none()
        if existing:
            print(f"[bootstrap] User '{admin_username}' already exists, skipping.")
            return

        user = User(
            username=admin_username,
            email=admin_email,
            hashed_password=hash_password(admin_password),
            is_active=True,
            is_superuser=True,
        )
        db.add(user)
        db.commit()
        print(f"[bootstrap] Created admin user '{admin_username}'.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
