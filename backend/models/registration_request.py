"""Modelo: RegistrationRequest (solicitud de alta de usuario, pendiente de aprobación)."""
from __future__ import annotations

import uuid
from typing import Literal, Optional

from sqlalchemy import String, Text, Enum, ForeignKey, UniqueConstraint, Uuid, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.config.database import Base
from datetime import datetime


class RegistrationRequest(Base):
    __tablename__ = "registration_request"

    registrationRequestId: Mapped[uuid.UUID] = mapped_column(
        "registration_request_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Datos de acceso solicitados
    username: Mapped[str] = mapped_column("username", String(100), index=True)
    email: Mapped[str] = mapped_column("email", String(255), index=True)
    hashedPassword: Mapped[str] = mapped_column("hashed_password", String(255))

    # Institución
    institutionId: Mapped[uuid.UUID] = mapped_column(
        "institution_id", ForeignKey("institution.institution_id"), nullable=False
    )
    institution: Mapped["Institution"] = relationship("Institution")

    # Curador (datos personales solicitados)
    fullName: Mapped[Optional[str]] = mapped_column("full_name", String(255))
    givenName: Mapped[Optional[str]] = mapped_column("given_name", String(100))
    familyName: Mapped[Optional[str]] = mapped_column("family_name", String(100))
    orcid: Mapped[Optional[str]] = mapped_column("orcid", String(50))
    phone: Mapped[Optional[str]] = mapped_column("phone", String(50))
    address: Mapped[Optional[str]] = mapped_column("address", Text())

    status: Mapped[Literal["pending", "approved", "rejected"]] = mapped_column(
        "status",
        Enum("pending", "approved", "rejected", name="registration_status_enum"),
        default="pending",
        index=True,
    )
    createdAt: Mapped[datetime] = mapped_column(
        "created_at", DateTime, default=datetime.utcnow, index=True
    )
    reviewedAt: Mapped[Optional[datetime]] = mapped_column(
        "reviewed_at", DateTime, nullable=True
    )

    reviewedByUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "reviewed_by_user_id", ForeignKey("users.user_id"), nullable=True
    )
    reviewedBy: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[reviewedByUserId]
    )

    resultingUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "resulting_user_id", ForeignKey("users.user_id"), nullable=True, unique=True
    )
    resultingUser: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[resultingUserId]
    )

    __table_args__ = (
        UniqueConstraint(
            "email",
            "status",
            name="uq_request_email_status_pending",
            deferrable=True,
            initially="DEFERRED",
        ),
    )
