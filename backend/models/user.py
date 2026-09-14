"""Modelo: User (cuenta del sistema; desacoplado de Agent)."""
from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.config.database import Base
from backend.models.collection import Collection, CollectionPermission
from backend.models.occurrence import Occurrence
from datetime import datetime


class User(Base):
    __tablename__ = "users"

    userId: Mapped[uuid.UUID] = mapped_column(
        "user_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    username: Mapped[str] = mapped_column("username", String(100), unique=True, index=True)
    email: Mapped[str] = mapped_column("email", String(255), unique=True, index=True)
    hashedPassword: Mapped[str] = mapped_column("hashed_password", String(255))
    isActive: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    isSuperuser: Mapped[bool] = mapped_column("is_superuser", Boolean, default=False)
    isInstitutionAdmin: Mapped[bool] = mapped_column(
        "is_institution_admin", Boolean, default=False
    )
    createdAt: Mapped[datetime] = mapped_column(
        "created_at", DateTime, default=datetime.utcnow
    )

    # Datos personales del usuario (curador/digitalizador)
    givenName: Mapped[Optional[str]] = mapped_column("given_name", String(100))
    familyName: Mapped[Optional[str]] = mapped_column("family_name", String(100))
    fullName: Mapped[Optional[str]] = mapped_column("full_name", String(255))
    orcid: Mapped[Optional[str]] = mapped_column("orcid", String(50))
    phone: Mapped[Optional[str]] = mapped_column("phone", String(50))
    address: Mapped[Optional[str]] = mapped_column("address", Text())

    # Importante: User y Agent están desacoplados (no hay agentId aquí)

    institutionId: Mapped[uuid.UUID] = mapped_column(
        "institution_id",
        ForeignKey("institution.institution_id"),
        nullable=False,
        index=True,
    )
    institution: Mapped["Institution"] = relationship(
        "Institution",
        back_populates="users",
        foreign_keys=[institutionId],
        primaryjoin="User.institutionId == Institution.institutionId",
    )

    # Colecciones creadas por este usuario
    collectionsCreated: Mapped[List["Collection"]] = relationship(
        "Collection",
        back_populates="creator",
        foreign_keys=lambda: [Collection.creatorUserId],
    )

    collectionPermissions: Mapped[List["CollectionPermission"]] = relationship(
        "CollectionPermission",
        back_populates="user",
        foreign_keys=lambda: [CollectionPermission.userId],
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Ocurrencias digitalizadas por este usuario
    occurrencesDigitized: Mapped[List["Occurrence"]] = relationship(
        "Occurrence",
        back_populates="digitizerUser",
        foreign_keys=lambda: [Occurrence.digitizerUserId],
    )
