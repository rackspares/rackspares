"""
User preferences and company settings router.

  GET  /api/preferences/me        - get current user's theme prefs
  PUT  /api/preferences/me        - update current user's theme prefs
  GET  /api/preferences/company   - get company settings (public — no auth required)
  GET  /api/preferences/logo/{f}  - serve logo file (public — no auth required)
  POST /api/preferences/logo      - upload company logo (admin)
  DELETE /api/preferences/logo    - remove company logo (admin)
"""

import os
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user, require_admin

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/uploads")
VALID_THEMES = {"dark", "light", "system"}


def _ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _get_or_create_prefs(db: Session, user_id: int) -> models.UserPreferences:
    prefs = db.query(models.UserPreferences).filter_by(user_id=user_id).first()
    if not prefs:
        prefs = models.UserPreferences(user_id=user_id, theme="dark", accent_color="#2563eb")
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs


def _get_or_create_company(db: Session) -> models.CompanySettings:
    settings = db.query(models.CompanySettings).first()
    if not settings:
        settings = models.CompanySettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/me", response_model=schemas.UserPreferencesOut)
def get_my_prefs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prefs = _get_or_create_prefs(db, current_user.id)
    return schemas.UserPreferencesOut(theme=prefs.theme, accent_color=prefs.accent_color)


@router.put("/me", response_model=schemas.UserPreferencesOut)
def update_my_prefs(
    payload: schemas.UserPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prefs = _get_or_create_prefs(db, current_user.id)
    if payload.theme is not None:
        if payload.theme not in VALID_THEMES:
            raise HTTPException(status_code=400, detail=f"theme must be one of {VALID_THEMES}")
        prefs.theme = payload.theme
    if payload.accent_color is not None:
        if not re.match(r"^#[0-9a-fA-F]{6}$", payload.accent_color):
            raise HTTPException(status_code=400, detail="accent_color must be a 6-digit hex color (#rrggbb)")
        prefs.accent_color = payload.accent_color
    db.commit()
    db.refresh(prefs)
    return schemas.UserPreferencesOut(theme=prefs.theme, accent_color=prefs.accent_color)


@router.get("/company", response_model=schemas.CompanySettingsOut)
def get_company_settings(db: Session = Depends(get_db)):
    """Public endpoint — no auth required (used on login page)."""
    settings = _get_or_create_company(db)
    logo_url = f"/api/preferences/logo/{settings.logo_filename}" if settings.logo_filename else None
    return schemas.CompanySettingsOut(logo_url=logo_url)


@router.post("/logo")
def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    _ensure_upload_dir()

    # Validate content type
    allowed = {"image/jpeg", "image/png", "image/webp"}
    content_type = file.content_type or ""
    if content_type not in allowed:
        raise HTTPException(
            status_code=415,
            detail="Logo must be a JPEG, PNG, or WebP image.",
        )

    # Determine extension
    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    ext = ext_map.get(content_type, ".png")
    filename = f"company_logo{ext}"
    dest = os.path.join(UPLOAD_DIR, filename)

    # Remove old logo files
    for old_ext in (".png", ".jpg", ".gif", ".svg", ".webp"):
        old_path = os.path.join(UPLOAD_DIR, f"company_logo{old_ext}")
        if os.path.exists(old_path):
            os.remove(old_path)

    contents = file.file.read()
    with open(dest, "wb") as f:
        f.write(contents)

    settings = _get_or_create_company(db)
    settings.logo_filename = filename
    db.commit()

    return {"logo_url": f"/api/preferences/logo/{filename}"}


@router.get("/logo/{filename}")
def serve_logo(filename: str):
    """Public endpoint — no auth required (used on login page and navbar)."""
    _ensure_upload_dir()
    # Sanitize filename to prevent path traversal
    safe = os.path.basename(filename)
    if not safe.startswith("company_logo"):
        raise HTTPException(status_code=404, detail="Not found")
    path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Logo not found")
    return FileResponse(path)


@router.delete("/logo", status_code=204)
def delete_logo(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    _ensure_upload_dir()
    settings = _get_or_create_company(db)
    if settings.logo_filename:
        path = os.path.join(UPLOAD_DIR, settings.logo_filename)
        if os.path.exists(path):
            os.remove(path)
        settings.logo_filename = None
        db.commit()
