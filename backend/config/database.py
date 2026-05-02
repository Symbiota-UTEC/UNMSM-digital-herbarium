from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(ENV_PATH)

USERNAME = os.getenv("USERNAME", "")
PASSWORD = os.getenv("PASSWORD", "")
HOST = os.getenv("HOST", "localhost")
PORT = os.getenv("PORT", "5432")
DATABASE = os.getenv("DATABASE", "")

DATABASE_URL = f"postgresql+psycopg2://{USERNAME}:{PASSWORD}@{HOST}:{PORT}/{DATABASE}"

engine = create_engine(DATABASE_URL, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[SessionLocal]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# def create_data_base_models() -> None:
#     Base.metadata.create_all(bind=engine)
#     print("[bootstrap] Database models created.")


def ensure_database_extensions() -> None:
    """Create database functions/extensions required by functional indexes."""
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public"))
        conn.execute(text("""
            CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
            RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS
            $$ BEGIN RETURN public.unaccent($1); END; $$
        """))


def reset_database():
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO PUBLIC"))
    ensure_database_extensions()
    Base.metadata.create_all(bind=engine)
    print("[bootstrap] Database reset completed.")
