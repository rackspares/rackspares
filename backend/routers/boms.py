import csv
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user, require_manager_or_admin

router = APIRouter()


def _bom_item_out(bi: models.BOMItem) -> schemas.BOMItemOut:
    inv = bi.inventory_item
    in_stock = inv.quantity if inv else 0
    cat = inv.category if inv else None
    return schemas.BOMItemOut(
        id=bi.id,
        bom_id=bi.bom_id,
        inventory_item_id=bi.inventory_item_id,
        quantity_needed=bi.quantity_needed,
        item_name=inv.name if inv else None,
        item_category_id=inv.category_id if inv else None,
        item_category_name=cat.name if cat else None,
        item_type=inv.item_type.value if inv and inv.item_type else None,
        quantity_in_stock=in_stock,
        quantity_to_order=max(0, bi.quantity_needed - in_stock),
    )


def _bom_out(bom: models.BOM) -> schemas.BOMOut:
    return schemas.BOMOut(
        id=bom.id,
        name=bom.name,
        description=bom.description,
        created_by=bom.created_by,
        creator_username=bom.creator.username if bom.creator else None,
        created_at=bom.created_at,
        status=bom.status,
        items=[_bom_item_out(bi) for bi in bom.items],
    )


def _write_bom_audit(
    db: Session,
    user: models.User,
    action: models.AuditAction,
    bom: models.BOM,
    changes: dict = None,
):
    db.add(models.AuditLog(
        user_id=user.id,
        username=user.username,
        action=action,
        entity_type="bom",
        entity_id=bom.id,
        entity_name=bom.name,
        changes=changes,
    ))


# ── List / Create ─────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.BOMOut])
def list_boms(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    boms = db.query(models.BOM).order_by(models.BOM.created_at.desc()).all()
    return [_bom_out(b) for b in boms]


@router.post("/", response_model=schemas.BOMOut, status_code=201)
def create_bom(
    payload: schemas.BOMCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    bom = models.BOM(
        name=payload.name,
        description=payload.description,
        created_by=current_user.id,
        status=models.BOMStatus.draft,
    )
    db.add(bom)
    db.flush()
    _write_bom_audit(db, current_user, models.AuditAction.create, bom, {"name": payload.name})
    db.commit()
    db.refresh(bom)
    return _bom_out(bom)


# ── Detail / Update ───────────────────────────────────────────────────────────

@router.get("/{bom_id}", response_model=schemas.BOMOut)
def get_bom(
    bom_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    bom = db.query(models.BOM).filter(models.BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    return _bom_out(bom)


@router.put("/{bom_id}", response_model=schemas.BOMOut)
def update_bom(
    bom_id: int,
    payload: schemas.BOMUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    bom = db.query(models.BOM).filter(models.BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    if bom.status != models.BOMStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft BOMs can be edited")

    changes = {}
    if payload.name is not None and payload.name != bom.name:
        changes["name"] = {"old": bom.name, "new": payload.name}
        bom.name = payload.name
    if payload.description is not None and payload.description != bom.description:
        changes["description"] = {"old": bom.description, "new": payload.description}
        bom.description = payload.description

    if changes:
        _write_bom_audit(db, current_user, models.AuditAction.update, bom, changes)
    db.commit()
    db.refresh(bom)
    return _bom_out(bom)


# ── BOM items ─────────────────────────────────────────────────────────────────

@router.post("/{bom_id}/items", response_model=schemas.BOMOut)
def add_bom_item(
    bom_id: int,
    payload: schemas.BOMItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    bom = db.query(models.BOM).filter(models.BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    if bom.status != models.BOMStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft BOMs can be edited")

    inv = db.query(models.InventoryItem).filter(
        models.InventoryItem.id == payload.inventory_item_id
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    # If item already in BOM, update quantity instead
    existing = next((bi for bi in bom.items if bi.inventory_item_id == payload.inventory_item_id), None)
    if existing:
        existing.quantity_needed = payload.quantity_needed
    else:
        db.add(models.BOMItem(
            bom_id=bom_id,
            inventory_item_id=payload.inventory_item_id,
            quantity_needed=payload.quantity_needed,
        ))

    _write_bom_audit(
        db, current_user, models.AuditAction.update, bom,
        {"item_added": inv.name, "quantity": payload.quantity_needed},
    )
    db.commit()
    db.refresh(bom)
    return _bom_out(bom)


@router.patch("/{bom_id}/items/{bom_item_id}", response_model=schemas.BOMOut)
def update_bom_item(
    bom_id: int,
    bom_item_id: int,
    payload: schemas.BOMItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    bom = db.query(models.BOM).filter(models.BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    if bom.status != models.BOMStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft BOMs can be edited")

    bi = db.query(models.BOMItem).filter(
        models.BOMItem.id == bom_item_id, models.BOMItem.bom_id == bom_id
    ).first()
    if not bi:
        raise HTTPException(status_code=404, detail="BOM item not found")

    bi.quantity_needed = payload.quantity_needed
    db.commit()
    db.refresh(bom)
    return _bom_out(bom)


@router.delete("/{bom_id}/items/{bom_item_id}", response_model=schemas.BOMOut)
def remove_bom_item(
    bom_id: int,
    bom_item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    bom = db.query(models.BOM).filter(models.BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    if bom.status != models.BOMStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft BOMs can be edited")

    bi = db.query(models.BOMItem).filter(
        models.BOMItem.id == bom_item_id, models.BOMItem.bom_id == bom_id
    ).first()
    if not bi:
        raise HTTPException(status_code=404, detail="BOM item not found")

    item_name = bi.inventory_item.name if bi.inventory_item else "unknown"
    db.delete(bi)
    _write_bom_audit(
        db, current_user, models.AuditAction.update, bom,
        {"item_removed": item_name},
    )
    db.commit()
    db.refresh(bom)
    return _bom_out(bom)


# ── Status transitions ────────────────────────────────────────────────────────

@router.post("/{bom_id}/submit", response_model=schemas.BOMOut)
def submit_bom(
    bom_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    bom = db.query(models.BOM).filter(models.BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    if bom.status != models.BOMStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft BOMs can be submitted")
    if not bom.items:
        raise HTTPException(status_code=400, detail="Cannot submit an empty BOM")

    bom.status = models.BOMStatus.submitted
    _write_bom_audit(
        db, current_user, models.AuditAction.update, bom,
        {"status": {"old": "draft", "new": "submitted"}},
    )
    db.commit()
    db.refresh(bom)
    return _bom_out(bom)


@router.post("/{bom_id}/fulfill", response_model=schemas.BOMOut)
def fulfill_bom(
    bom_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    bom = db.query(models.BOM).filter(models.BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")
    if bom.status != models.BOMStatus.submitted:
        raise HTTPException(status_code=400, detail="Only submitted BOMs can be fulfilled")

    bom.status = models.BOMStatus.fulfilled
    _write_bom_audit(
        db, current_user, models.AuditAction.update, bom,
        {"status": {"old": "submitted", "new": "fulfilled"}},
    )
    db.commit()
    db.refresh(bom)
    return _bom_out(bom)


# ── CSV export ────────────────────────────────────────────────────────────────

@router.get("/{bom_id}/export")
def export_bom_csv(
    bom_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    bom = db.query(models.BOM).filter(models.BOM.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="BOM not found")

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Item", "Category", "Type", "In Stock", "Needed", "To Order"])

    for bi in bom.items:
        inv = bi.inventory_item
        cat_name = inv.category.name if inv and inv.category else "—"
        item_type = inv.item_type.value if inv and inv.item_type else "—"
        in_stock = inv.quantity if inv else 0
        needed = bi.quantity_needed
        to_order = max(0, needed - in_stock)
        w.writerow([inv.name if inv else "?", cat_name, item_type, in_stock, needed, to_order])

    buf.seek(0)
    safe = "".join(c for c in bom.name if c.isalnum() or c in " -_").strip().replace(" ", "-")
    filename = f"bom-{safe or bom.id}-{bom.id}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
