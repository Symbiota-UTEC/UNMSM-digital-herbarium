"""Modelo DwC: Institution."""
from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy import String, Text, Integer, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.config.database import Base


class Institution(Base):
    __tablename__ = "institution"

    institutionId: Mapped[uuid.UUID] = mapped_column(
        "institution_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    institutionName: Mapped[Optional[str]] = mapped_column(
        "institution_name", String(255)
    )
    country: Mapped[Optional[str]] = mapped_column("country", String(100))
    city: Mapped[Optional[str]] = mapped_column("city", String(100))
    address: Mapped[Optional[str]] = mapped_column("address", Text())
    email: Mapped[Optional[str]] = mapped_column("email", String(255))
    phone: Mapped[Optional[str]] = mapped_column("phone", String(50))
    webSite: Mapped[Optional[str]] = mapped_column("web_site", String(255))

    institutionAdminUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "institution_admin_user_id",
        ForeignKey(
            "users.user_id",
            use_alter=True,
            name="fk_institution_admin_user"
        ),
        nullable=True,
        unique=True,
    )
    institutionAdminUser: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[institutionAdminUserId],
        lazy="joined",
        post_update=True,
    )

    usersCount: Mapped[int] = mapped_column(
        "users_count", Integer, default=0, nullable=False
    )
    users: Mapped[List["User"]] = relationship(
        "User",
        back_populates="institution",
        foreign_keys="[User.institutionId]",
        primaryjoin="User.institutionId == Institution.institutionId",
        cascade="all, delete-orphan",
        passive_deletes=False,
    )

    collections: Mapped[List["Collection"]] = relationship(
        "Collection", back_populates="institution"
    )
