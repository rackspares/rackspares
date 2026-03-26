"""
Netbox integration router.

Handles:
  - GET/PUT /api/netbox/config          (admin only)
  - POST    /api/netbox/test-connection  (admin only)
  - POST    /api/netbox/sync             (admin only)
  - GET     /api/netbox/sites
  - GET     /api/netbox/racks
  - GET     /api/netbox/racks/{id}/devices
  - PUT     /api/netbox/device-types/{id}/mapping  (admin only)
  - POST    /api/netbox/clone-rack       (manager+)
"""

import base64
import hashlib
import os
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user, require_admin, require_manager_or_admin

router = APIRouter()

# ── Token encryption ──────────────────────────────────────────────────────────

def _fernet():
    from cryptography.fernet import Fernet
    secret = os.getenv("SECRET_KEY", "changeme-in-production")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except Exception:
        return ""


# ── Config helpers ────────────────────────────────────────────────────────────

def _get_or_create_config(db: Session) -> models.NetboxConfig:
    cfg = db.query(models.NetboxConfig).first()
    if not cfg:
        cfg = models.NetboxConfig()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _config_out(cfg: models.NetboxConfig) -> schemas.NetboxConfigOut:
    return schemas.NetboxConfigOut(
        id=cfg.id,
        mode=cfg.mode,
        api_url=cfg.api_url,
        has_token=bool(cfg.encrypted_token),
        auto_sync_interval_minutes=cfg.auto_sync_interval_minutes,
        last_sync_at=cfg.last_sync_at,
        last_sync_status=cfg.last_sync_status,
    )


# ── Netbox API helper ─────────────────────────────────────────────────────────

def _auth_header(token: str) -> str:
    """Return the correct Authorization header value for the token format.
    Netbox v4.5+ v2 tokens start with 'nbt_' and use Bearer auth."""
    if token.startswith("nbt_"):
        return f"Bearer {token}"
    return f"Token {token}"


def _nb_get(api_url: str, token: str, path: str, params: dict = None) -> Any:
    """Fetch all pages from a Netbox list endpoint and return combined results."""
    base = api_url.rstrip("/")
    url = f"{base}{path}"
    headers = {"Authorization": _auth_header(token), "Accept": "application/json"}
    results = []
    while url:
        resp = httpx.get(url, headers=headers, params=params, timeout=15)
        if resp.status_code == 401:
            raise HTTPException(status_code=400, detail="Netbox: invalid token (401 Unauthorized)")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Netbox returned {resp.status_code}")
        data = resp.json()
        results.extend(data.get("results", []))
        url = data.get("next")
        params = None  # next URL already has query params
    return results


def _nb_get_meta(api_url: str, token: str) -> Dict:
    """Fetch Netbox status endpoint to verify connectivity and get version info."""
    base = api_url.rstrip("/")
    headers = {"Authorization": _auth_header(token), "Accept": "application/json"}
    resp = httpx.get(f"{base}/api/status/", headers=headers, timeout=10)
    if resp.status_code == 401:
        raise HTTPException(status_code=400, detail="Netbox: invalid token")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Netbox returned {resp.status_code}")
    return resp.json()


# ── Config endpoints ──────────────────────────────────────────────────────────

@router.get("/config", response_model=schemas.NetboxConfigOut)
def get_config(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    return _config_out(_get_or_create_config(db))


@router.put("/config", response_model=schemas.NetboxConfigOut)
def update_config(
    payload: schemas.NetboxConfigUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    cfg = _get_or_create_config(db)
    if payload.mode is not None:
        if payload.mode not in ("external", "builtin"):
            raise HTTPException(status_code=400, detail="mode must be 'external' or 'builtin'")
        cfg.mode = payload.mode
    if payload.api_url is not None:
        cfg.api_url = payload.api_url.rstrip("/")
    if payload.token is not None and payload.token.strip():
        cfg.encrypted_token = encrypt_token(payload.token.strip())
    if payload.auto_sync_interval_minutes is not None:
        cfg.auto_sync_interval_minutes = payload.auto_sync_interval_minutes
    db.commit()
    db.refresh(cfg)
    return _config_out(cfg)


@router.post("/test-connection")
def test_connection(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    cfg = _get_or_create_config(db)
    if not cfg.api_url:
        raise HTTPException(status_code=400, detail="Netbox API URL not configured")
    if not cfg.encrypted_token:
        raise HTTPException(status_code=400, detail="Netbox token not configured")
    token = decrypt_token(cfg.encrypted_token)
    try:
        meta = _nb_get_meta(cfg.api_url, token)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Connection failed: {exc}")
    version = meta.get("netbox-version") or meta.get("netbox_version") or meta.get("version") or "unknown"
    return {"status": "ok", "netbox_version": version, "api_url": cfg.api_url}


# ── Sync ──────────────────────────────────────────────────────────────────────

@router.post("/sync")
def trigger_sync(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    cfg = _get_or_create_config(db)
    if not cfg.api_url or not cfg.encrypted_token:
        raise HTTPException(status_code=400, detail="Netbox not configured")

    token = decrypt_token(cfg.encrypted_token)
    stats = {"sites": 0, "racks": 0, "device_types": 0, "devices": 0}

    try:
        # ── Sites ──────────────────────────────────────────────────────────────
        nb_sites = _nb_get(cfg.api_url, token, "/api/dcim/sites/")
        site_map: Dict[int, int] = {}  # netbox_id → local id
        for s in nb_sites:
            existing = db.query(models.NetboxSite).filter_by(netbox_id=s["id"]).first()
            if existing:
                existing.name = s["name"]
                existing.slug = s["slug"]
                existing.description = s.get("description") or ""
                existing.synced_at = models.utcnow()
                site_map[s["id"]] = existing.id
            else:
                row = models.NetboxSite(
                    netbox_id=s["id"],
                    name=s["name"],
                    slug=s["slug"],
                    description=s.get("description") or "",
                )
                db.add(row)
                db.flush()
                site_map[s["id"]] = row.id
            stats["sites"] += 1

        # ── Racks ──────────────────────────────────────────────────────────────
        nb_racks = _nb_get(cfg.api_url, token, "/api/dcim/racks/")
        rack_map: Dict[int, int] = {}
        for r in nb_racks:
            nb_site_id = r.get("site", {})
            if isinstance(nb_site_id, dict):
                nb_site_id = nb_site_id.get("id")
            local_site_id = site_map.get(nb_site_id) if nb_site_id else None

            location = r.get("location")
            if isinstance(location, dict):
                location = location.get("name")

            existing = db.query(models.NetboxRack).filter_by(netbox_id=r["id"]).first()
            if existing:
                existing.name = r["name"]
                existing.site_id = local_site_id
                existing.location = location
                existing.u_height = r.get("u_height", 42)
                existing.description = r.get("description") or ""
                existing.synced_at = models.utcnow()
                rack_map[r["id"]] = existing.id
            else:
                row = models.NetboxRack(
                    netbox_id=r["id"],
                    name=r["name"],
                    site_id=local_site_id,
                    location=location,
                    u_height=r.get("u_height", 42),
                    description=r.get("description") or "",
                )
                db.add(row)
                db.flush()
                rack_map[r["id"]] = row.id
            stats["racks"] += 1

        # ── Device types ────────────────────────────────────────────────────────
        nb_dtypes = _nb_get(cfg.api_url, token, "/api/dcim/device-types/")
        dtype_map: Dict[int, int] = {}
        for dt in nb_dtypes:
            mfr = dt.get("manufacturer", {})
            if isinstance(mfr, dict):
                mfr = mfr.get("name")
            existing = db.query(models.NetboxDeviceType).filter_by(netbox_id=dt["id"]).first()
            if existing:
                existing.manufacturer = mfr
                existing.model = dt["model"]
                existing.slug = dt.get("slug")
                existing.u_height = dt.get("u_height", 1)
                existing.synced_at = models.utcnow()
                dtype_map[dt["id"]] = existing.id
            else:
                row = models.NetboxDeviceType(
                    netbox_id=dt["id"],
                    manufacturer=mfr,
                    model=dt["model"],
                    slug=dt.get("slug"),
                    u_height=dt.get("u_height", 1),
                )
                db.add(row)
                db.flush()
                dtype_map[dt["id"]] = row.id
            stats["device_types"] += 1

        # ── Devices ────────────────────────────────────────────────────────────
        nb_devices = _nb_get(cfg.api_url, token, "/api/dcim/devices/")
        for d in nb_devices:
            nb_rack = d.get("rack", {})
            if isinstance(nb_rack, dict):
                nb_rack = nb_rack.get("id")
            local_rack_id = rack_map.get(nb_rack) if nb_rack else None

            nb_dt = d.get("device_type", {})
            if isinstance(nb_dt, dict):
                nb_dt = nb_dt.get("id")
            local_dtype_id = dtype_map.get(nb_dt) if nb_dt else None

            role = d.get("role") or d.get("device_role") or {}
            if isinstance(role, dict):
                role = role.get("name")

            face = d.get("face")
            if isinstance(face, dict):
                face = face.get("value")

            existing = db.query(models.NetboxDevice).filter_by(netbox_id=d["id"]).first()
            if existing:
                existing.name = d.get("name")
                existing.rack_id = local_rack_id
                existing.device_type_id = local_dtype_id
                existing.role = role
                existing.position = d.get("position")
                existing.face = face
                existing.synced_at = models.utcnow()
            else:
                db.add(models.NetboxDevice(
                    netbox_id=d["id"],
                    name=d.get("name"),
                    rack_id=local_rack_id,
                    device_type_id=local_dtype_id,
                    role=role,
                    position=d.get("position"),
                    face=face,
                ))
            stats["devices"] += 1

        cfg.last_sync_at = models.utcnow()
        cfg.last_sync_status = "ok"
        db.commit()

        # Audit log
        db.add(models.AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action=models.AuditAction.create,
            entity_type="netbox_sync",
            entity_name="sync",
            changes=stats,
        ))
        db.commit()

    except HTTPException:
        cfg.last_sync_status = "error: request failed"
        db.commit()
        raise
    except Exception as exc:
        cfg.last_sync_status = f"error: {exc}"
        db.commit()
        raise HTTPException(status_code=502, detail=f"Sync failed: {exc}")

    return {"status": "ok", "stats": stats}


# ── Browse endpoints ──────────────────────────────────────────────────────────

@router.get("/sites", response_model=List[schemas.NetboxSiteOut])
def list_sites(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    sites = db.query(models.NetboxSite).order_by(models.NetboxSite.name).all()
    result = []
    for s in sites:
        out = schemas.NetboxSiteOut(
            id=s.id,
            netbox_id=s.netbox_id,
            name=s.name,
            slug=s.slug,
            description=s.description,
            synced_at=s.synced_at,
            rack_count=len(s.racks),
        )
        result.append(out)
    return result


@router.get("/racks", response_model=List[schemas.NetboxRackOut])
def list_racks(
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    q = db.query(models.NetboxRack)
    if site_id:
        q = q.filter(models.NetboxRack.site_id == site_id)
    racks = q.order_by(models.NetboxRack.name).all()
    result = []
    for r in racks:
        out = schemas.NetboxRackOut(
            id=r.id,
            netbox_id=r.netbox_id,
            name=r.name,
            site_id=r.site_id,
            site_name=r.site.name if r.site else None,
            location=r.location,
            u_height=r.u_height,
            description=r.description,
            device_count=len(r.devices),
        )
        result.append(out)
    return result


@router.get("/racks/{rack_id}/devices", response_model=List[schemas.NetboxDeviceOut])
def list_rack_devices(
    rack_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    rack = db.query(models.NetboxRack).filter(models.NetboxRack.id == rack_id).first()
    if not rack:
        raise HTTPException(status_code=404, detail="Rack not found")
    result = []
    for d in sorted(rack.devices, key=lambda x: (x.position or 0)):
        dt = d.device_type
        out = schemas.NetboxDeviceOut(
            id=d.id,
            netbox_id=d.netbox_id,
            name=d.name,
            rack_id=d.rack_id,
            device_type_id=d.device_type_id,
            device_type_model=dt.model if dt else None,
            device_type_manufacturer=dt.manufacturer if dt else None,
            role=d.role,
            position=d.position,
            face=d.face,
        )
        result.append(out)
    return result


@router.get("/device-types", response_model=List[schemas.NetboxDeviceTypeOut])
def list_device_types(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    dtypes = db.query(models.NetboxDeviceType).order_by(
        models.NetboxDeviceType.manufacturer, models.NetboxDeviceType.model
    ).all()
    result = []
    for dt in dtypes:
        out = schemas.NetboxDeviceTypeOut(
            id=dt.id,
            netbox_id=dt.netbox_id,
            manufacturer=dt.manufacturer,
            model=dt.model,
            slug=dt.slug,
            u_height=dt.u_height,
            inventory_category_id=dt.inventory_category_id,
            inventory_category_name=dt.inventory_category.name if dt.inventory_category else None,
        )
        result.append(out)
    return result


@router.put("/device-types/{dtype_id}/mapping", response_model=schemas.NetboxDeviceTypeOut)
def update_dtype_mapping(
    dtype_id: int,
    payload: schemas.DeviceTypeMappingUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
):
    dt = db.query(models.NetboxDeviceType).filter(models.NetboxDeviceType.id == dtype_id).first()
    if not dt:
        raise HTTPException(status_code=404, detail="Device type not found")
    dt.inventory_category_id = payload.inventory_category_id
    db.commit()
    db.refresh(dt)
    return schemas.NetboxDeviceTypeOut(
        id=dt.id,
        netbox_id=dt.netbox_id,
        manufacturer=dt.manufacturer,
        model=dt.model,
        slug=dt.slug,
        u_height=dt.u_height,
        inventory_category_id=dt.inventory_category_id,
        inventory_category_name=dt.inventory_category.name if dt.inventory_category else None,
    )


# ── Clone-a-rack ──────────────────────────────────────────────────────────────

def _check_optic_flags(
    db: Session,
    device_type: models.NetboxDeviceType,
    destination_platform: Optional[str],
) -> List[Dict]:
    """Return optic flag dicts if the device type looks like a transceiver."""
    if not destination_platform:
        return []
    # Heuristic: transceivers have keywords in name
    transceiver_keywords = ("sfp", "qsfp", "xfp", "cfp", "xcvr", "optic", "transceiver", "dwdm")
    model_lower = (device_type.model or "").lower()
    if not any(kw in model_lower for kw in transceiver_keywords):
        return []

    # Look up compatibility
    compat = db.query(models.OpticCompatibility).filter(
        models.OpticCompatibility.transceiver_model.ilike(f"%{device_type.model}%")
    ).first()

    if not compat:
        return [{"level": "unverified", "message": f"No compatibility data for {device_type.model}"}]

    dest_lower = destination_platform.lower()
    incompatible = [p for p in (compat.incompatible_platforms or []) if dest_lower in p.lower()]
    compatible = [p for p in (compat.compatible_platforms or []) if dest_lower in p.lower()]

    if incompatible:
        return [{"level": "incompatible", "message": f"Known incompatible with {destination_platform}"}]
    if compatible:
        return [{"level": "confirmed", "message": f"Confirmed compatible with {destination_platform}"}]
    return [{"level": "unverified", "message": f"Compatibility with {destination_platform} not verified"}]


@router.post("/clone-rack", response_model=schemas.CloneRackResult)
def clone_rack(
    payload: schemas.CloneRackRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager_or_admin),
):
    rack = db.query(models.NetboxRack).filter(
        models.NetboxRack.id == payload.netbox_rack_id
    ).first()
    if not rack:
        raise HTTPException(status_code=404, detail="Rack not found")

    # Count device types in this rack
    from collections import Counter
    dtype_counts: Counter = Counter()
    dtype_objects: Dict[int, models.NetboxDeviceType] = {}

    for device in rack.devices:
        if device.device_type_id:
            dtype_counts[device.device_type_id] += 1
            if device.device_type_id not in dtype_objects and device.device_type:
                dtype_objects[device.device_type_id] = device.device_type

    line_items: List[schemas.CloneRackLineItem] = []
    bom_items_to_add: List[Dict] = []

    for dtype_id, qty_needed in dtype_counts.items():
        dt = dtype_objects.get(dtype_id)
        if not dt:
            continue

        # Find best matching inventory item — prefer items in mapped category
        matched_item = None
        if dt.inventory_category_id:
            matched_item = db.query(models.InventoryItem).filter(
                models.InventoryItem.category_id == dt.inventory_category_id,
                models.InventoryItem.name.ilike(f"%{dt.model}%"),
                models.InventoryItem.status == models.ItemStatus.available,
            ).first()
            if not matched_item:
                matched_item = db.query(models.InventoryItem).filter(
                    models.InventoryItem.category_id == dt.inventory_category_id,
                    models.InventoryItem.status == models.ItemStatus.available,
                ).first()

        if not matched_item:
            matched_item = db.query(models.InventoryItem).filter(
                models.InventoryItem.name.ilike(f"%{dt.model}%"),
                models.InventoryItem.status == models.ItemStatus.available,
            ).first()

        in_stock = matched_item.quantity if matched_item else 0
        to_order = max(0, qty_needed - in_stock)

        optic_flags = _check_optic_flags(db, dt, payload.destination_site)

        cat = dt.inventory_category
        item = schemas.CloneRackLineItem(
            device_type_model=dt.model,
            device_type_manufacturer=dt.manufacturer,
            inventory_category_id=dt.inventory_category_id,
            inventory_category_name=cat.name if cat else None,
            matched_inventory_item_id=matched_item.id if matched_item else None,
            matched_inventory_item_name=matched_item.name if matched_item else None,
            quantity_needed=qty_needed,
            quantity_in_stock=in_stock,
            quantity_to_order=to_order,
            optic_flags=optic_flags,
        )
        line_items.append(item)

        if payload.create_bom and matched_item and to_order > 0:
            bom_items_to_add.append({"item_id": matched_item.id, "qty": to_order})

    line_items.sort(key=lambda x: x.device_type_model)

    # Create BOM with shortfall items if requested
    bom_id = None
    bom_name = None
    if payload.create_bom:
        bom_name = payload.bom_name or f"Clone: {rack.name}"
        desc = f"Generated from Clone-a-Rack: {rack.name}"
        if payload.destination_site:
            desc += f" → {payload.destination_site}"
        bom = models.BOM(
            name=bom_name,
            description=desc,
            created_by=current_user.id,
            status=models.BOMStatus.draft,
        )
        db.add(bom)
        db.flush()

        for entry in bom_items_to_add:
            db.add(models.BOMItem(
                bom_id=bom.id,
                inventory_item_id=entry["item_id"],
                quantity_needed=entry["qty"],
            ))

        db.add(models.AuditLog(
            user_id=current_user.id,
            username=current_user.username,
            action=models.AuditAction.create,
            entity_type="bom",
            entity_id=bom.id,
            entity_name=bom.name,
            changes={
                "source": "clone_rack",
                "rack": rack.name,
                "destination_site": payload.destination_site,
            },
        ))
        db.commit()
        bom_id = bom.id

    # Audit: clone operation
    db.add(models.AuditLog(
        user_id=current_user.id,
        username=current_user.username,
        action=models.AuditAction.create,
        entity_type="clone_rack",
        entity_name=rack.name,
        changes={
            "rack": rack.name,
            "destination_site": payload.destination_site,
            "device_types": len(line_items),
            "bom_created": bom_id,
        },
    ))
    db.commit()

    return schemas.CloneRackResult(
        rack_name=rack.name,
        site_name=rack.site.name if rack.site else None,
        destination_site=payload.destination_site,
        total_device_types=len(line_items),
        line_items=line_items,
        bom_id=bom_id,
        bom_name=bom_name,
    )
