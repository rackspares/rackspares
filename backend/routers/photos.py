"""
Photo upload and serving endpoints for inventory items.

Consumable photos:
  POST   /api/consumables/{item_id}/photos
  GET    /api/consumables/{item_id}/photos
  DELETE /api/consumables/{item_id}/photos/{photo_id}
  GET    /api/consumables/{item_id}/photos/{photo_id}/file

Asset photos:
  POST   /api/assets/{item_id}/photos
  GET    /api/assets/{item_id}/photos
  DELETE /api/assets/{item_id}/photos/{photo_id}
  GET    /api/assets/{item_id}/photos/{photo_id}/file
"""

import os
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user, require_manager_or_admin

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/uploads")
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
EXT_MAP = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB

consumable_router = APIRouter()
asset_router = APIRouter()


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _photo_dir(kind: str, item_id: int) -> str:
    return os.path.join(UPLOAD_DIR, kind, str(item_id))


def _photo_url(kind: str, item_id: int, photo_id: int) -> str:
    return f"/api/{kind}s/{item_id}/photos/{photo_id}/file"


def _get_item(db: Session, item_id: int) -> models.InventoryItem:
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def _get_photo(db: Session, photo_id: int, item_id: int) -> models.ItemPhoto:
    photo = db.query(models.ItemPhoto).filter(
        models.ItemPhoto.id == photo_id,
        models.ItemPhoto.item_id == item_id,
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return photo


def _write_audit(db: Session, user: models.User, action: models.AuditAction,
                 item: models.InventoryItem, photo_id: int, changes: dict = None):
    db.add(models.AuditLog(
        user_id=user.id,
        username=user.username,
        action=action,
        entity_type="item_photo",
        entity_id=photo_id,
        entity_name=item.name,
        changes=changes,
    ))


def _upload_photo(
    db: Session,
    item: models.InventoryItem,
    kind: str,
    file: UploadFile,
    label: str,
    current_user: models.User,
) -> schemas.ItemPhotoOut:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Photo must be a JPEG, PNG, or WebP image.")

    contents = file.file.read()
    if len(contents) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 10 MB size limit.")

    ext = EXT_MAP[content_type]
    filename = f"{uuid.uuid4().hex}{ext}"
    dest_dir = _photo_dir(kind, item.id)
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, filename)
    with open(dest, "wb") as f:
        f.write(contents)

    photo = models.ItemPhoto(
        item_id=item.id,
        filename=filename,
        storage_path=dest,
        uploaded_by=current_user.id,
        uploaded_at=datetime.now(timezone.utc),
        label=label.strip() if label else None,
    )
    db.add(photo)
    db.flush()
    _write_audit(db, current_user, models.AuditAction.create, item, photo.id,
                 {"filename": filename, "label": photo.label})
    db.commit()
    db.refresh(photo)

    return schemas.ItemPhotoOut(
        id=photo.id,
        item_id=photo.item_id,
        filename=photo.filename,
        uploaded_by=photo.uploaded_by,
        uploaded_at=photo.uploaded_at,
        label=photo.label,
        url=_photo_url(kind, item.id, photo.id),
    )


def _list_photos(db: Session, item: models.InventoryItem, kind: str) -> List[schemas.ItemPhotoOut]:
    photos = (
        db.query(models.ItemPhoto)
        .filter(models.ItemPhoto.item_id == item.id)
        .order_by(models.ItemPhoto.uploaded_at.asc())
        .all()
    )
    return [
        schemas.ItemPhotoOut(
            id=p.id,
            item_id=p.item_id,
            filename=p.filename,
            uploaded_by=p.uploaded_by,
            uploaded_at=p.uploaded_at,
            label=p.label,
            url=_photo_url(kind, item.id, p.id),
        )
        for p in photos
    ]


def _delete_photo(db: Session, item: models.InventoryItem, photo_id: int,
                  current_user: models.User):
    photo = _get_photo(db, photo_id, item.id)
    if os.path.exists(photo.storage_path):
        os.remove(photo.storage_path)
    _write_audit(db, current_user, models.AuditAction.delete, item, photo.id,
                 {"filename": photo.filename})
    db.delete(photo)
    db.commit()


def _serve_photo(db: Session, item_id: int, photo_id: int) -> FileResponse:
    photo = _get_photo(db, photo_id, item_id)
    if not os.path.exists(photo.storage_path):
        raise HTTPException(status_code=404, detail="Photo file not found on disk")
    return FileResponse(photo.storage_path)


# ── Consumable photo endpoints ─────────────────────────────────────────────────

@consumable_router.post("/{item_id}/photos", response_model=schemas.ItemPhotoOut, status_code=201)
def upload_consumable_photo(
    item_id: int,
    file: UploadFile = File(...),
    label: str = "",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    item = _get_item(db, item_id)
    if item.item_type != models.ItemType.consumable:
        raise HTTPException(status_code=400, detail="Item is not a consumable.")
    return _upload_photo(db, item, "consumable", file, label, current_user)


@consumable_router.get("/{item_id}/photos", response_model=List[schemas.ItemPhotoOut])
def list_consumable_photos(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    item = _get_item(db, item_id)
    if item.item_type != models.ItemType.consumable:
        raise HTTPException(status_code=400, detail="Item is not a consumable.")
    return _list_photos(db, item, "consumable")


@consumable_router.delete("/{item_id}/photos/{photo_id}", status_code=204)
def delete_consumable_photo(
    item_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    item = _get_item(db, item_id)
    _delete_photo(db, item, photo_id, current_user)


@consumable_router.get("/{item_id}/photos/{photo_id}/file")
def serve_consumable_photo(
    item_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return _serve_photo(db, item_id, photo_id)


# ── Asset photo endpoints ──────────────────────────────────────────────────────

@asset_router.post("/{item_id}/photos", response_model=schemas.ItemPhotoOut, status_code=201)
def upload_asset_photo(
    item_id: int,
    file: UploadFile = File(...),
    label: str = "",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    item = _get_item(db, item_id)
    if item.item_type != models.ItemType.asset:
        raise HTTPException(status_code=400, detail="Item is not an asset.")
    if not item.serial_number:
        raise HTTPException(
            status_code=400,
            detail="A serial number must be set on the asset before photos can be attached.",
        )
    return _upload_photo(db, item, "asset", file, label, current_user)


@asset_router.get("/{item_id}/photos", response_model=List[schemas.ItemPhotoOut])
def list_asset_photos(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    item = _get_item(db, item_id)
    if item.item_type != models.ItemType.asset:
        raise HTTPException(status_code=400, detail="Item is not an asset.")
    return _list_photos(db, item, "asset")


@asset_router.delete("/{item_id}/photos/{photo_id}", status_code=204)
def delete_asset_photo(
    item_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    item = _get_item(db, item_id)
    _delete_photo(db, item, photo_id, current_user)


@asset_router.get("/{item_id}/photos/{photo_id}/file")
def serve_asset_photo(
    item_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return _serve_photo(db, item_id, photo_id)
