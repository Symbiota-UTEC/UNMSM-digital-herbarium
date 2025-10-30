# routers/institutions.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.config.database import get_db
from backend.models.models import Institution, User

from pydantic import BaseModel

router = APIRouter(prefix="/institutions", tags=["institutions"])

class AdminUserOut(BaseModel):
    id: int
    username: str
    email: str

    class Config:
        orm_mode = True

class InstitutionOut(BaseModel):
    id: int
    institutionID: Optional[str]
    institutionCode: Optional[str]
    institutionName: Optional[str]
    country: Optional[str]
    city: Optional[str]
    address: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    webSite: Optional[str]
    institution_admin_user_id: Optional[int]
    admin_user: Optional[AdminUserOut]  # gracias a lazy="joined" viene cargado

    class Config:
        orm_mode = True


@router.get("", response_model=List[InstitutionOut], summary="List all institutions")
def list_institutions(
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = (
        select(Institution)
        .order_by(Institution.institutionName.nulls_last())
        .limit(limit)
        .offset(offset)
    )
    institutions = db.scalars(stmt).all()
    return institutions


@router.get("/{institution_id}", response_model=InstitutionOut, summary="Get institution by id")
def get_institution_by_id(institution_id: int, db: Session = Depends(get_db)):
    stmt = select(Institution).where(Institution.id == institution_id)
    inst = db.scalars(stmt).first()
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Institution not found",
        )
    return inst
