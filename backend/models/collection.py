"""Modelos DwC: Collection y CollectionPermission."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.config.database import Base


class Collection(Base):
    """Colección física o virtual que alberga especímenes/registros."""

    __tablename__ = "collection"

    collectionId: Mapped[uuid.UUID] = mapped_column(
        "collection_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collectionName: Mapped[Optional[str]] = mapped_column("collection_name", String(255))
    description: Mapped[Optional[str]] = mapped_column("description", Text())

    institutionId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "institution_id", ForeignKey("institution.institution_id")
    )
    institution: Mapped[Optional["Institution"]] = relationship(
        "Institution", back_populates="collections"
    )

    # El creador es un User, no un Agent
    creatorUserId: Mapped[uuid.UUID] = mapped_column(
        "creator_user_id",
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    creator: Mapped["User"] = relationship(
        "User",
        back_populates="collectionsCreated",
        foreign_keys=[creatorUserId],
    )

    occurrences: Mapped[List["Occurrence"]] = relationship(
        "Occurrence", back_populates="collection"
    )

    permissions: Mapped[List["CollectionPermission"]] = relationship(
        "CollectionPermission",
        back_populates="collection",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class CollectionPermission(Base):
    __tablename__ = "collection_permission"

    collectionPermissionId: Mapped[uuid.UUID] = mapped_column(
        "collection_permission_id", Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collectionId: Mapped[uuid.UUID] = mapped_column(
        "collection_id",
        ForeignKey("collection.collection_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    userId: Mapped[uuid.UUID] = mapped_column(
        "user_id",
        ForeignKey("users.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        "role",
        Enum("viewer", "editor", "owner", name="collection_permission_enum"),
        nullable=False,
        index=True,
    )
    grantedByUserId: Mapped[Optional[uuid.UUID]] = mapped_column(
        "granted_by_user_id", ForeignKey("users.user_id"), nullable=True
    )
    createdAt: Mapped[datetime] = mapped_column(
        "created_at", DateTime, default=datetime.utcnow, nullable=False
    )

    collection: Mapped["Collection"] = relationship("Collection", back_populates="permissions")
    user: Mapped["User"] = relationship(
        "User",
        back_populates="collectionPermissions",
        foreign_keys=[userId],
    )
    grantedBy: Mapped[Optional["User"]] = relationship("User", foreign_keys=[grantedByUserId])

    __table_args__ = (UniqueConstraint("collection_id", "user_id", name="uq_collection_user"),)
