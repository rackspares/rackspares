from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import require_admin, require_manager_or_admin

router = APIRouter()


@router.get("/", response_model=List[schemas.SiteOut])
def list_sites(
    _: models.User = Depends(require_manager_or_admin),
    db: Session = Depends(get_db),
):
    return db.query(models.Site).order_by(models.Site.name).all()


@router.post("/", response_model=schemas.SiteOut, status_code=201)
def create_site(
    payload: schemas.SiteCreate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sc = payload.short_code.strip().upper()

    if db.query(models.Site).filter(models.Site.name == payload.name).first():
        raise HTTPException(status_code=409, detail="A site with this name already exists")
    if db.query(models.Site).filter(models.Site.short_code == sc).first():
        raise HTTPException(status_code=409, detail="A site with this short code already exists")

    site = models.Site(name=payload.name.strip(), short_code=sc, address=payload.address)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


@router.put("/{site_id}", response_model=schemas.SiteOut)
def update_site(
    site_id: int,
    payload: schemas.SiteUpdate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    site = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    updates = payload.model_dump(exclude_unset=True)

    if "name" in updates:
        conflict = db.query(models.Site).filter(
            models.Site.name == updates["name"],
            models.Site.id != site_id,
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="A site with this name already exists")

    if "short_code" in updates:
        updates["short_code"] = updates["short_code"].strip().upper()
        conflict = db.query(models.Site).filter(
            models.Site.short_code == updates["short_code"],
            models.Site.id != site_id,
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="A site with this short code already exists")

    for field, value in updates.items():
        setattr(site, field, value)

    db.commit()
    db.refresh(site)
    return site


@router.delete("/{site_id}", status_code=204)
def deactivate_site(
    site_id: int,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Soft-deactivate a site (never hard-deleted)."""
    site = db.query(models.Site).filter(models.Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    site.active = False
    db.commit()
