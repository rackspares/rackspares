import base64
import hashlib
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import require_admin

router = APIRouter()

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-in-production")


def _fernet():
    from cryptography.fernet import Fernet
    key = base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest())
    return Fernet(key)


def _get_or_create_config(db: Session) -> models.LdapConfig:
    cfg = db.query(models.LdapConfig).first()
    if not cfg:
        cfg = models.LdapConfig()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=schemas.LdapConfigOut)
def get_config(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    cfg = _get_or_create_config(db)
    out = schemas.LdapConfigOut.model_validate(cfg)
    out.bind_password_set = bool(cfg.bind_password_encrypted)
    return out


@router.put("", response_model=schemas.LdapConfigOut)
def update_config(
    payload: schemas.LdapConfigUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    cfg = _get_or_create_config(db)

    if payload.server is not None:
        cfg.server = payload.server
    if payload.port is not None:
        cfg.port = payload.port
    if payload.base_dn is not None:
        cfg.base_dn = payload.base_dn
    if payload.bind_account is not None:
        cfg.bind_account = payload.bind_account
    if payload.bind_password is not None and payload.bind_password.strip():
        cfg.bind_password_encrypted = _fernet().encrypt(payload.bind_password.encode()).decode()
    if payload.user_search_filter is not None:
        cfg.user_search_filter = payload.user_search_filter
    if payload.use_tls is not None:
        cfg.use_tls = payload.use_tls

    db.commit()
    db.refresh(cfg)
    out = schemas.LdapConfigOut.model_validate(cfg)
    out.bind_password_set = bool(cfg.bind_password_encrypted)
    return out


@router.post("/test", response_model=schemas.LdapTestResult)
def test_connection(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    cfg = db.query(models.LdapConfig).first()
    if not cfg or not cfg.server or not cfg.base_dn or not cfg.bind_account or not cfg.bind_password_encrypted:
        raise HTTPException(status_code=400, detail="LDAP configuration is incomplete")

    try:
        from ldap3 import ALL, SIMPLE, Connection, Server

        bind_password = _fernet().decrypt(cfg.bind_password_encrypted.encode()).decode()

        server = Server(cfg.server, port=cfg.port, use_ssl=cfg.use_tls, get_info=ALL)
        conn = Connection(server, user=cfg.bind_account, password=bind_password, authentication=SIMPLE)

        if not conn.bind():
            return schemas.LdapTestResult(
                success=False,
                detail=f"Service account bind failed: {conn.last_error}",
                users_found=0,
            )

        sample_filter = cfg.user_search_filter.replace("{username}", "*")
        conn.search(cfg.base_dn, sample_filter, attributes=["distinguishedName"])
        users_found = len(conn.entries)
        conn.unbind()

        return schemas.LdapTestResult(
            success=True,
            detail="Connection successful",
            users_found=users_found,
        )
    except Exception as exc:
        return schemas.LdapTestResult(success=False, detail=str(exc), users_found=0)


@router.post("/enable", status_code=200)
def enable_ldap(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    cfg = _get_or_create_config(db)

    # Guard: must have at least one LDAP admin before enabling
    ldap_admin = (
        db.query(models.User)
        .filter(
            models.User.auth_type == models.AuthType.ldap,
            models.User.role == models.UserRole.admin,
        )
        .first()
    )
    if not ldap_admin:
        raise HTTPException(
            status_code=400,
            detail=(
                "Assign Admin role to a domain account before enabling LDAP. "
                "Log in with a domain account first — it will be auto-provisioned as Viewer, "
                "then promote it to Admin, then enable LDAP."
            ),
        )

    cfg.enabled = True
    # Deactivate all local users
    db.query(models.User).filter(models.User.auth_type == models.AuthType.local).update(
        {models.User.is_active: False}
    )
    db.commit()
    return {"enabled": True}


@router.post("/disable", status_code=200)
def disable_ldap(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    cfg = _get_or_create_config(db)
    cfg.enabled = False
    # Re-activate all local users
    db.query(models.User).filter(models.User.auth_type == models.AuthType.local).update(
        {models.User.is_active: True}
    )
    db.commit()
    return {"enabled": False}
