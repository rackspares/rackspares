from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import require_manager_or_admin

router = APIRouter()


@router.get("/", response_model=List[schemas.AuditLogOut])
def list_audit_logs(
    username: Optional[str] = Query(default=None, max_length=50),
    action: Optional[schemas.AuditAction] = Query(default=None),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_manager_or_admin),
):
    q = db.query(models.AuditLog)

    if username:
        q = q.filter(models.AuditLog.username.ilike(f"%{username}%"))
    if action:
        q = q.filter(models.AuditLog.action == action)
    if start_date:
        q = q.filter(models.AuditLog.timestamp >= start_date)
    if end_date:
        q = q.filter(models.AuditLog.timestamp <= end_date)

    return (
        q.order_by(models.AuditLog.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
