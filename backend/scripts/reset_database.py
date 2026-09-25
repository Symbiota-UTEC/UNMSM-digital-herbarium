# backend/scripts/reset_database.py
"""Borra el esquema `public` y lo recrea vacío — pierdes todos los datos.

Solo para desarrollo local, a demanda (`make db-reset`). El arranque normal
(`make dev` / `make prd`, o `backend/main.py` directamente) ya crea las tablas
que falten sin borrar nada; este script no forma parte de ese camino.
"""

from __future__ import annotations

import backend.models.models  # noqa: F401 — registra todas las tablas en Base.metadata
from backend.config.database import reset_database

if __name__ == "__main__":
    reset_database()
