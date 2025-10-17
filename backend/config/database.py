from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from dotenv import load_dotenv
from sqlalchemy import create_engine
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


def create_data_base_models() -> None:
    Base.metadata.create_all(bind=engine)
