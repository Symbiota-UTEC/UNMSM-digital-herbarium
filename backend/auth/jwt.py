# backend/auth/jwt.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.config.database import get_db
from backend.models.models import User
from backend.config.auth import (
    secret_key,
    algorithm,
    access_token_expire_minutes,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    to_encode = data.copy()

    now = _now_utc()
    expire = now + (expires_delta or timedelta(minutes=access_token_expire_minutes))

    to_encode.update(
        {
            "iat": int(now.timestamp()),
            "nbf": int(now.timestamp()),
            "exp": int(expire.timestamp()),
        }
    )

    encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=algorithm)
    return encoded_jwt


def create_user_token(
    *,
    user_id: int,
    email: str,
    agent_id: Optional[int] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Helper for auth: encodes user_id, email (sub), and optional agent_id.
    """
    payload = {"sub": email, "user_id": user_id}
    if agent_id is not None:
        payload["agent_id"] = agent_id
    return create_access_token(payload, expires_delta=expires_delta)


def verify_token(token: str) -> Dict[str, Any]:
    """
    Verifies JWT and returns decoded payload.
    Raises 401 if invalid/expired.
    """
    try:
        payload = jwt.decode(token, secret_key, algorithms=[algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_payload(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """
    Extracts JWT payload for routes that need user info.
    """
    payload = verify_token(token)
    if "sub" not in payload or "user_id" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return payload


def get_current_user(
    payload: Dict[str, Any] = Depends(get_current_payload),
    db: Session = Depends(get_db),
) -> User:
    user = (
        db.execute(select(User).where(User.id == payload["user_id"]))
        .scalar_one_or_none()
    )
    if not user or not user.isActive:
        raise HTTPException(status_code=401, detail="Inactive or missing user")
    return user


# ==============================
#  Reglas de autorización
# ==============================

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Requiere que el usuario sea superuser o admin de institución.
    """
    if not (current_user.isSuperuser or current_user.isInstitutionAdmin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para acceder a este recurso.",
        )
    return current_user


def require_superuser(current_user: User = Depends(get_current_user)) -> User:
    """
    Requiere que el usuario sea superuser.
    """
    if not current_user.isSuperuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los superusuarios pueden acceder a este recurso.",
        )
    return current_user
