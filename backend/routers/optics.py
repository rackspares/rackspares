"""
Optic compatibility router.

  GET    /api/optics/           - list all entries (any role)
  POST   /api/optics/           - create entry (admin)
  PUT    /api/optics/{id}       - update entry (admin)
  DELETE /api/optics/{id}       - delete entry (admin)
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user, require_admin

router = APIRouter()

VALID_LEVELS = {"confirmed", "unverified", "incompatible"}


def _out(o: models.OpticCompatibility) -> schemas.OpticCompatibilityOut:
    return schemas.OpticCompatibilityOut(
        id=o.id,
        transceiver_model=o.transceiver_model,
        compatible_platforms=o.compatible_platforms or [],
        incompatible_platforms=o.incompatible_platforms or [],
        notes=o.notes,
        compat_level=o.compat_level,
        created_by=o.created_by,
        created_at=o.created_at,
        updated_at=o.updated_at,
    )


@router.get("/", response_model=List[schemas.OpticCompatibilityOut])
def list_optics(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    rows = db.query(models.OpticCompatibility).order_by(
        models.OpticCompatibility.transceiver_model
    ).all()
    return [_out(r) for r in rows]


@router.post("/", response_model=schemas.OpticCompatibilityOut, status_code=201)
def create_optic(
    payload: schemas.OpticCompatibilityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    if payload.compat_level not in VALID_LEVELS:
        raise HTTPException(status_code=400, detail=f"compat_level must be one of {VALID_LEVELS}")
    row = models.OpticCompatibility(
        transceiver_model=payload.transceiver_model,
        compatible_platforms=payload.compatible_platforms,
        incompatible_platforms=payload.incompatible_platforms,
        notes=payload.notes,
        compat_level=payload.compat_level,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row)


@router.put("/{optic_id}", response_model=schemas.OpticCompatibilityOut)
def update_optic(
    optic_id: int,
    payload: schemas.OpticCompatibilityUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    row = db.query(models.OpticCompatibility).filter(
        models.OpticCompatibility.id == optic_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Optic entry not found")
    if payload.transceiver_model is not None:
        row.transceiver_model = payload.transceiver_model
    if payload.compatible_platforms is not None:
        row.compatible_platforms = payload.compatible_platforms
    if payload.incompatible_platforms is not None:
        row.incompatible_platforms = payload.incompatible_platforms
    if payload.notes is not None:
        row.notes = payload.notes
    if payload.compat_level is not None:
        if payload.compat_level not in VALID_LEVELS:
            raise HTTPException(status_code=400, detail=f"compat_level must be one of {VALID_LEVELS}")
        row.compat_level = payload.compat_level
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{optic_id}", status_code=204)
def delete_optic(
    optic_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    row = db.query(models.OpticCompatibility).filter(
        models.OpticCompatibility.id == optic_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Optic entry not found")
    db.delete(row)
    db.commit()
