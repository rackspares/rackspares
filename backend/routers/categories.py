from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user, require_admin, require_manager_or_admin

router = APIRouter()


@router.get("/", response_model=List[schemas.CategoryFlat])
def list_categories(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return db.query(models.Category).order_by(models.Category.name).all()


@router.post("/", response_model=schemas.CategoryFlat, status_code=201)
def create_category(
    payload: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    # Idempotent: return existing category if name+parent already exists
    existing = db.query(models.Category).filter(
        models.Category.name == payload.name,
        models.Category.parent_id == payload.parent_id,
    ).first()
    if existing:
        return existing

    if payload.parent_id:
        parent = db.query(models.Category).filter(models.Category.id == payload.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent category not found")
        # Enforce max depth of 3: parent must be at depth ≤ 2
        if parent.parent_id:
            grandparent = db.query(models.Category).filter(
                models.Category.id == parent.parent_id
            ).first()
            if grandparent and grandparent.parent_id:
                raise HTTPException(status_code=400, detail="Maximum category depth is 3 levels")

    cat = models.Category(
        name=payload.name,
        parent_id=payload.parent_id,
        created_by=current_user.id,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/{cat_id}", response_model=schemas.CategoryFlat)
def update_category(
    cat_id: int,
    payload: schemas.CategoryUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.name is not None:
        cat.name = payload.name
    if "parent_id" in payload.model_fields_set:
        cat.parent_id = payload.parent_id

    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{cat_id}", status_code=204)
def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # Block deletion if items use this category
    item_count = db.query(models.InventoryItem).filter(
        models.InventoryItem.category_id == cat_id
    ).count()
    if item_count:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {item_count} inventory item(s) use this category. Reassign them first.",
        )

    # Block deletion if child categories exist
    child_count = db.query(models.Category).filter(
        models.Category.parent_id == cat_id
    ).count()
    if child_count:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {child_count} sub-categor(y/ies) exist. Delete or move them first.",
        )

    db.delete(cat)
    db.commit()
