from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user, require_manager_or_admin

router = APIRouter()


def _serialize(v):
    """Make a value safe for JSON storage in audit logs."""
    if isinstance(v, datetime):
        return v.isoformat()
    if hasattr(v, "value"):  # SQLAlchemy Enum
        return v.value
    return v


def _item_snapshot(item: models.InventoryItem) -> dict:
    return {
        "name": item.name,
        "category": item.category,
        "quantity": item.quantity,
        "location": item.location,
        "status": _serialize(item.status),
        "description": item.description,
        "last_verified": _serialize(item.last_verified),
    }


def _write_audit(
    db: Session,
    user: models.User,
    action: models.AuditAction,
    item: models.InventoryItem,
    changes: Optional[dict] = None,
):
    db.add(models.AuditLog(
        user_id=user.id,
        username=user.username,
        action=action,
        entity_type="inventory_item",
        entity_id=item.id,
        entity_name=item.name,
        changes=changes,
    ))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.InventoryItemOut])
def list_items(
    search: Optional[str] = Query(default=None, max_length=200),
    category: Optional[str] = Query(default=None),
    status: Optional[schemas.ItemStatus] = Query(default=None),
    stale: Optional[str] = Query(default=None, pattern="^(any|amber|red)$"),
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
    if stale:
        # amber = 30+ days unverified; red = 90+ days unverified
        cutoff_days = 90 if stale == "red" else 30
        cutoff = datetime.now(timezone.utc) - timedelta(days=cutoff_days)
        q = q.filter(
            or_(
                models.InventoryItem.last_verified == None,  # noqa: E711
                models.InventoryItem.last_verified < cutoff,
            )
        )

    return q.order_by(models.InventoryItem.date_added.desc()).all()


@router.post("/", response_model=schemas.InventoryItemOut, status_code=201)
def create_item(
    item: schemas.InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    db_item = models.InventoryItem(**item.model_dump())
    db.add(db_item)
    db.flush()  # get db_item.id before audit log
    _write_audit(db, current_user, models.AuditAction.create, db_item, _item_snapshot(db_item))
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
    current_user: models.User = Depends(require_manager_or_admin),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    before = _item_snapshot(item)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(item, field, value)
    item.last_updated = datetime.now(timezone.utc)

    after = _item_snapshot(item)
    diff = {
        k: {"old": before[k], "new": after[k]}
        for k in after
        if before.get(k) != after.get(k)
    }
    _write_audit(db, current_user, models.AuditAction.update, item, diff or None)

    db.commit()
    db.refresh(item)
    return item


@router.patch("/{item_id}/verify", response_model=schemas.InventoryItemOut)
def verify_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    old_verified = _serialize(item.last_verified)
    item.last_verified = datetime.now(timezone.utc)
    item.last_updated = item.last_verified

    _write_audit(
        db, current_user, models.AuditAction.update, item,
        {"last_verified": {"old": old_verified, "new": _serialize(item.last_verified)}},
    )

    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    snapshot = _item_snapshot(item)
    _write_audit(db, current_user, models.AuditAction.delete, item, snapshot)
    db.delete(item)
    db.commit()
