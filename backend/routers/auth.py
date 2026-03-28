import base64
import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import jwt
import bcrypt as _bcrypt
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db


def _fernet():
    from cryptography.fernet import Fernet
    key = base64.urlsafe_b64encode(hashlib.sha256(
        os.getenv("SECRET_KEY", "changeme-in-production").encode()
    ).digest())
    return Fernet(key)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt(rounds=12)).decode()


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    return jwt.encode({"sub": subject, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exc
    except jwt.PyJWTError:
        raise credentials_exc

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None or not user.is_active:
        raise credentials_exc
    return user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != models.UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_manager_or_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role not in (models.UserRole.admin, models.UserRole.manager):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or admin access required")
    return current_user


# ── Auth endpoints ────────────────────────────────────────────────────────────

@router.post("/token", response_model=schemas.Token)
@limiter.limit("5/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    _creds_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    ldap_cfg = db.query(models.LdapConfig).first()

    if ldap_cfg and ldap_cfg.enabled:
        # ── LDAP authentication ────────────────────────────────────────────────
        if not ldap_cfg.bind_password_encrypted:
            raise _creds_exc
        try:
            from ldap3 import ALL, SIMPLE, Connection, Server
            from ldap3.utils.conv import escape_filter_chars

            bind_password = _fernet().decrypt(ldap_cfg.bind_password_encrypted.encode()).decode()
            server = Server(ldap_cfg.server, port=ldap_cfg.port, use_ssl=ldap_cfg.use_tls, get_info=ALL)
            service_conn = Connection(
                server, user=ldap_cfg.bind_account, password=bind_password, authentication=SIMPLE
            )
            if not service_conn.bind():
                raise _creds_exc

            search_filter = ldap_cfg.user_search_filter.replace("{username}", escape_filter_chars(form_data.username))
            service_conn.search(ldap_cfg.base_dn, search_filter, attributes=["distinguishedName"])
            if not service_conn.entries:
                raise _creds_exc

            user_dn = service_conn.entries[0].entry_dn
            service_conn.unbind()

            user_conn = Connection(server, user=user_dn, password=form_data.password, authentication=SIMPLE)
            if not user_conn.bind():
                raise _creds_exc
            user_conn.unbind()
        except HTTPException:
            raise
        except Exception:
            raise _creds_exc

        # Look up or auto-provision in RackSpares DB
        user = db.query(models.User).filter(models.User.username == form_data.username).first()
        if not user:
            user = models.User(
                username=form_data.username,
                hashed_password=hash_password(os.urandom(16).hex()),
                role=models.UserRole.viewer,
                auth_type=models.AuthType.ldap,
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        elif user.auth_type == models.AuthType.local:
            raise _creds_exc
        elif not user.is_active:
            raise _creds_exc
    else:
        # ── Local authentication ───────────────────────────────────────────────
        user = db.query(models.User).filter(models.User.username == form_data.username).first()
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise _creds_exc
        if not user.is_active:
            raise _creds_exc

    token = create_access_token(
        subject=user.username,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", status_code=204)
def change_password(
    payload: schemas.PasswordChange,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.auth_type == models.AuthType.ldap:
        raise HTTPException(status_code=400, detail="Password is managed by your domain controller.")
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 12:
        raise HTTPException(status_code=422, detail="Password must be at least 12 characters.")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()


# ── User management (admin only) ──────────────────────────────────────────────

@router.get("/users", response_model=List[schemas.UserOut])
def list_users(
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(models.User).order_by(models.User.created_at).all()


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(
    payload: schemas.UserCreate,
    _: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    if len(payload.password) < 12:
        raise HTTPException(status_code=422, detail="Password must be at least 12 characters.")
    user = models.User(
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.is_active is False and user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    if payload.role is not None:
        user.role = payload.role
    if payload.password is not None:
        if len(payload.password) < 12:
            raise HTTPException(status_code=422, detail="Password must be at least 12 characters.")
        user.hashed_password = hash_password(payload.password)
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user
