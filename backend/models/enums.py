# backend/models/enums.py
"""
Enums de dominio: una sola definición para la BD, los esquemas de la API y la lógica.

Son `str` + `Enum`: se serializan como su valor ("owner") en JSON y siguen comparándose con
strings, pero en el código se usan los miembros (`CollectionRole.OWNER`), no literales.
Las etiquetas de los ENUM de PostgreSQL son los `value`, así que no requieren migración.
"""

from __future__ import annotations

import enum

from sqlalchemy import Enum as SAEnum


class CollectionRole(str, enum.Enum):
    """Rol explícito de un usuario en una colección (`CollectionPermission.role`)."""

    VIEWER = "viewer"
    EDITOR = "editor"
    OWNER = "owner"


class EffectiveRole(str, enum.Enum):
    """Lo que el cliente recibe en `myRole`: rol explícito o el privilegio que lo reemplaza."""

    SUPERUSER = "superuser"
    INSTITUTION_ADMIN = "institution_admin"
    OWNER = "owner"
    EDITOR = "editor"
    VIEWER = "viewer"


class CollectionAccess(str, enum.Enum):
    """Filtro de `GET /collections`: las que creé o todas a las que tengo acceso."""

    OWNER = "owner"
    ALLOWED = "allowed"


class RegistrationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ImportJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


def db_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Columna ENUM nativa de PostgreSQL con los `value` como etiquetas (no los nombres)."""
    return SAEnum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])
