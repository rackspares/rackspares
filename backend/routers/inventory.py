from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[schemas.InventoryItemOut])
def list_items(
    search: Optional[str] = Query(default=None, max_length=200),
    category: Optional[str] = Query(default=None),
    status: Optional[schemas.ItemStatus] = Query(default=None),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    q = db.query(models.InventoryItem)

    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                models.InventoryItem.name.ilike(term),
                models.InventoryItem.description.ilike(term),
                models.InventoryItem.location.ilike(term),
            )
        )
    if category:
        q = q.filter(models.InventoryItem.category == category)
    if status:
        q = q.filter(models.InventoryItem.status == status)

    return q.order_by(models.InventoryItem.date_added.desc()).all()


@router.post("/", response_model=schemas.InventoryItemOut, status_code=201)
def create_item(
    item: schemas.InventoryItemCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    db_item = models.InventoryItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.get("/{item_id}", response_model=schemas.InventoryItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.put("/{item_id}", response_model=schemas.InventoryItemOut)
def update_item(
    item_id: int,
    payload: schemas.InventoryItemUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.last_updated = datetime.now(timezone.utc)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
