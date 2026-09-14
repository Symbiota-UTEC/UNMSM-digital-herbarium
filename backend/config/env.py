"""
Punto único de carga de variables de entorno para todo el backend.

El resto de `config/` y `scripts/create_admin.py` importan `getenv`/
`getenv_list` de aquí en vez de llamar a `load_dotenv()` por su cuenta.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)


def getenv(name: str, default: Optional[str] = None) -> Optional[str]:
    """`os.getenv` con un default explícito (evita `None` silencioso)."""
    value = os.getenv(name)
    return value if value is not None else default


def getenv_list(name: str, default: str = "") -> List[str]:
    """Variable de entorno de valores separados por coma -> lista de strings limpios."""
    raw = getenv(name, default) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]
