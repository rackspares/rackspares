"""
Services management router — setup wizard, per-service connect/deploy/test.
"""
import asyncio
import json
import os
import shutil
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import require_admin
from routers.netbox import _fernet          # reuse existing encryption helper

router = APIRouter()

VALID_SERVICES = {"netbox", "paperless", "n8n"}
SERVICES_DIR   = "/services"               # compose files mounted here in container

# Default credentials written to DB when a service is deployed via the wizard
DEFAULT_DEPLOY_CONFIG = {
    "netbox": {
        "url":     "http://localhost:8100",
        "api_key": "0123456789abcdef0123456789abcdef01234567",
    },
    "paperless": {
        "url":     "http://localhost:8200",
        "api_key": "",   # user must create an API token via Paperless admin UI
    },
    "n8n": {
        "url":     "http://localhost:5678",
        "api_key": "",   # API key optional for basic connectivity
    },
}


# ── Encryption helpers ─────────────────────────────────────────────────────────

def _encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def _decrypt(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except Exception:
        return ""


def _encrypt_creds(creds: dict) -> str:
    return _encrypt(json.dumps(creds))


def _decrypt_creds(encrypted: Optional[str]) -> dict:
    if not encrypted:
        return {}
    try:
        return json.loads(_decrypt(encrypted))
    except Exception:
        return {}


# ── DB helpers ─────────────────────────────────────────────────────────────────

def _get_or_create_service(db: Session, name: str) -> models.ServiceConfig:
    cfg = (
        db.query(models.ServiceConfig)
        .filter(models.ServiceConfig.service_name == name)
        .first()
    )
    if not cfg:
        cfg = models.ServiceConfig(service_name=name)
        db.add(cfg)
        db.flush()
    return cfg


def _get_or_create_company(db: Session) -> models.CompanySettings:
    c = db.query(models.CompanySettings).first()
    if not c:
        c = models.CompanySettings()
        db.add(c)
        db.flush()
    return c


# ── Connection test functions ──────────────────────────────────────────────────

async def _test_netbox(url: str, api_key: str) -> tuple[bool, str]:
    try:
        header = "Bearer" if api_key.startswith("nbt_") else "Token"
        async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
            resp = await client.get(
                url.rstrip("/") + "/api/",
                headers={"Authorization": f"{header} {api_key}"},
            )
        if resp.status_code == 200:
            return True, "Connected successfully"
        return False, f"HTTP {resp.status_code}: unexpected response"
    except Exception as e:
        return False, str(e)


async def _test_paperless(url: str, api_key: str) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
            if api_key:
                resp = await client.get(
                    url.rstrip("/") + "/api/",
                    headers={"Authorization": f"Token {api_key}"},
                )
                if resp.status_code == 200:
                    return True, "Connected successfully"
                return False, f"HTTP {resp.status_code}"
            else:
                # No key — just verify server is reachable (401 = server up, auth needed)
                resp = await client.get(url.rstrip("/") + "/api/")
                if resp.status_code in (200, 401, 403):
                    return True, "Server reachable (no API token configured yet)"
                return False, f"HTTP {resp.status_code}"
    except Exception as e:
        return False, str(e)


async def _test_n8n(url: str, api_key: str) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
            resp = await client.get(url.rstrip("/") + "/healthz")
        if resp.status_code == 200:
            return True, "Connected successfully"
        return False, f"HTTP {resp.status_code}"
    except Exception as e:
        return False, str(e)


_TEST_FN = {
    "netbox":    _test_netbox,
    "paperless": _test_paperless,
    "n8n":       _test_n8n,
}


# ── Wizard endpoints ───────────────────────────────────────────────────────────

@router.get("/wizard-status")
def wizard_status(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Returns whether the first-run setup wizard has been completed/dismissed."""
    company = _get_or_create_company(db)
    db.commit()
    return {"completed": company.setup_wizard_completed}


@router.post("/wizard-complete")
def wizard_complete(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Mark the setup wizard as completed so it never auto-shows again."""
    company = _get_or_create_company(db)
    company.setup_wizard_completed = True
    db.commit()
    return {"ok": True}


# ── Service status ─────────────────────────────────────────────────────────────

@router.get("/status")
def services_status(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Return connection status for all managed services."""
    result = {}
    for name in VALID_SERVICES:
        cfg = (
            db.query(models.ServiceConfig)
            .filter(models.ServiceConfig.service_name == name)
            .first()
        )
        if not cfg or not cfg.url:
            result[name] = {
                "status": "not_configured",
                "url": None,
                "last_tested_at": None,
                "last_test_status": None,
            }
        else:
            result[name] = {
                "status": "connected" if cfg.is_connected else "unreachable",
                "url": cfg.url,
                "last_tested_at": cfg.last_tested_at,
                "last_test_status": cfg.last_test_status,
            }
    return result


# ── Connect / test ─────────────────────────────────────────────────────────────

@router.post("/{name}/connect")
async def connect_service(
    name: str,
    payload: schemas.ServiceConnectRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Save credentials and test the connection. Returns 422 if test fails."""
    if name not in VALID_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service: {name}")

    ok, msg = await _TEST_FN[name](payload.url, payload.api_key)

    cfg = _get_or_create_service(db, name)
    cfg.url = payload.url
    cfg.encrypted_credentials = _encrypt_creds({"api_key": payload.api_key})
    cfg.is_connected = ok
    cfg.last_tested_at = datetime.now(timezone.utc)
    cfg.last_test_status = msg
    db.commit()

    if not ok:
        raise HTTPException(status_code=422, detail=msg)
    return {"ok": True, "message": msg}


@router.post("/{name}/test")
async def test_service(
    name: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Re-test an already-configured service using stored credentials."""
    if name not in VALID_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service: {name}")

    cfg = (
        db.query(models.ServiceConfig)
        .filter(models.ServiceConfig.service_name == name)
        .first()
    )
    if not cfg or not cfg.url:
        raise HTTPException(status_code=404, detail="Service not configured")

    creds = _decrypt_creds(cfg.encrypted_credentials)
    ok, msg = await _TEST_FN[name](cfg.url, creds.get("api_key", ""))

    cfg.is_connected = ok
    cfg.last_tested_at = datetime.now(timezone.utc)
    cfg.last_test_status = msg
    db.commit()

    return {"ok": ok, "message": msg}


# ── Deploy ─────────────────────────────────────────────────────────────────────

@router.post("/{name}/deploy")
async def deploy_service(
    name: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """
    Run `docker compose up -d` for the named service and stream the output
    as Server-Sent Events. Saves default connection config before starting.

    Each SSE event is JSON with one of:
      { "line": "<output text>" }
      { "done": true, "exit_code": 0 }
      { "error": "<message>" }
    """
    if name not in VALID_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service: {name}")

    compose_file = os.path.join(SERVICES_DIR, name, "docker-compose.yml")
    if not os.path.exists(compose_file):
        raise HTTPException(
            status_code=500,
            detail=f"Compose file not found at {compose_file}. Is the services volume mounted?",
        )

    if not shutil.which("docker"):
        raise HTTPException(
            status_code=500,
            detail="Docker CLI not found in container. Is the backend image built with Docker CLI support?",
        )

    # Persist default connection config before streaming starts
    defaults = DEFAULT_DEPLOY_CONFIG[name]
    cfg = _get_or_create_service(db, name)
    cfg.url = defaults["url"]
    cfg.encrypted_credentials = _encrypt_creds({"api_key": defaults.get("api_key", "")})
    cfg.is_connected = False          # will be updated after auto-test
    cfg.last_tested_at = None
    cfg.last_test_status = "Deploying…"
    db.commit()

    async def generate():
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "compose",
                "-f", compose_file,
                "up", "-d", "--pull", "always",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            async for raw in proc.stdout:
                line = raw.decode("utf-8", errors="replace").rstrip()
                yield f"data: {json.dumps({'line': line})}\n\n"

            rc = await proc.wait()
            yield f"data: {json.dumps({'done': True, 'exit_code': rc})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Disconnect ─────────────────────────────────────────────────────────────────

@router.delete("/{name}")
def disconnect_service(
    name: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    """Remove saved credentials for a service (does not stop containers)."""
    if name not in VALID_SERVICES:
        raise HTTPException(status_code=404, detail=f"Unknown service: {name}")

    cfg = (
        db.query(models.ServiceConfig)
        .filter(models.ServiceConfig.service_name == name)
        .first()
    )
    if cfg:
        cfg.url = None
        cfg.encrypted_credentials = None
        cfg.is_connected = False
        cfg.last_tested_at = None
        cfg.last_test_status = None
        db.commit()

    return {"ok": True}
