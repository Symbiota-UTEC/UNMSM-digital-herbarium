# backend/routers/auth.py
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional

from backend.config.database import get_db
from backend.models.models import User, Agent
from backend.utils.security import hash_password, verify_password
from backend.auth.jwt import create_user_token
from backend.config.auth import access_token_expire_minutes
from backend.auth.jwt import get_current_payload


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", summary="Register a new user (with optional Agent link)")
def register_user(
    username: str = Body(...),
    email: str = Body(...),
    password: str = Body(...),
    full_name: Optional[str] = Body(None),
    given_name: Optional[str] = Body(None),
    family_name: Optional[str] = Body(None),
    orcid: Optional[str] = Body(None),
    organization_name: Optional[str] = Body(None),
    db: Session = Depends(get_db),
):

    existing_user = db.execute(
        select(User).where((User.username == username) | (User.email == email))
    ).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered",
        )

    agent = None
    if full_name or orcid or organization_name:
        agent = Agent(
            agentID=orcid or None,
            agentType="Person",
            fullName=full_name,
            givenName=given_name,
            familyName=family_name,
            organizationName=organization_name,
            orcid=orcid,
            email=email,
        )
        db.add(agent)
        db.flush()

    new_user = User(
        username=username,
        email=email,
        hashed_password=hash_password(password),
        agent_id=agent.id if agent else None,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "User created successfully",
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
            "agent_id": new_user.agent_id,
        },
    }



@router.post("/login", summary="Authenticate user and return JWT token")
def login_user(
    username: str = Body(...),
    password: str = Body(...),
    db: Session = Depends(get_db),
):
    user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token_expires = timedelta(minutes=access_token_expire_minutes)
    access_token = create_user_token(
        user_id=user.id,
        username=user.username,
        agent_id=user.agent_id,
        expires_delta=token_expires,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "agent_id": user.agent_id,
        },
    }




@router.get("/me", summary="Get current user info from JWT")
def get_me(payload = Depends(get_current_payload)):
    return {
        "username": payload["sub"],
        "user_id": payload["user_id"],
        "agent_id": payload.get("agent_id"),
    }
