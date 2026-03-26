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
        "category_id": item.category_id,
        "item_type": _serialize(item.item_type),
        "quantity": item.quantity,
        "minimum_stock": item.minimum_stock,
        "lead_time_days": item.lead_time_days,
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


def _get_descendant_ids(db: Session, cat_id: int) -> List[int]:
    """Return cat_id plus all descendant category IDs (max depth 3)."""
    ids = [cat_id]
    children = db.query(models.Category).filter(models.Category.parent_id == cat_id).all()
    for child in children:
        ids.append(child.id)
        grandchildren = db.query(models.Category).filter(models.Category.parent_id == child.id).all()
        for gc in grandchildren:
            ids.append(gc.id)
    return ids


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.InventoryItemOut])
def list_items(
    search: Optional[str] = Query(default=None, max_length=200),
    category_id: Optional[int] = Query(default=None),
    item_type: Optional[schemas.ItemType] = Query(default=None),
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
    if category_id is not None:
        ids = _get_descendant_ids(db, category_id)
        q = q.filter(models.InventoryItem.category_id.in_(ids))
    if item_type:
        q = q.filter(models.InventoryItem.item_type == item_type)
    if status:
        q = q.filter(models.InventoryItem.status == status)
    if stale:
        cutoff_days = 90 if stale == "red" else 30
        cutoff = datetime.now(timezone.utc) - timedelta(days=cutoff_days)
        q = q.filter(
            or_(
                models.InventoryItem.last_verified == None,  # noqa: E711
                models.InventoryItem.last_verified < cutoff,
            )
        )

    return q.order_by(models.InventoryItem.date_added.desc()).all()


@router.get("/reorder", response_model=List[schemas.ReorderAlertOut])
def reorder_alerts(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_manager_or_admin),
):
    """Return consumable items where quantity < minimum_stock."""
    items = (
        db.query(models.InventoryItem)
        .filter(
            models.InventoryItem.item_type == models.ItemType.consumable,
            models.InventoryItem.minimum_stock != None,  # noqa: E711
            models.InventoryItem.quantity < models.InventoryItem.minimum_stock,
        )
        .order_by(models.InventoryItem.quantity)
        .all()
    )

    result = []
    for item in items:
        shortfall = item.minimum_stock - item.quantity
        urgency = "critical" if item.quantity == 0 else "warning"
        base = schemas.InventoryItemOut.model_validate(item)
        result.append(schemas.ReorderAlertOut(
            **base.model_dump(),
            shortfall=shortfall,
            urgency=urgency,
        ))
    return result


@router.post("/", response_model=schemas.InventoryItemOut, status_code=201)
def create_item(
    item: schemas.InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    if item.category_id is not None:
        if not db.query(models.Category).filter(models.Category.id == item.category_id).first():
            raise HTTPException(status_code=404, detail="Category not found")

    db_item = models.InventoryItem(**item.model_dump())
    db.add(db_item)
    db.flush()
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

    updates = payload.model_dump(exclude_unset=True)
    if "category_id" in updates and updates["category_id"] is not None:
        if not db.query(models.Category).filter(models.Category.id == updates["category_id"]).first():
            raise HTTPException(status_code=404, detail="Category not found")

    before = _item_snapshot(item)
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
