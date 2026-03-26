from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ItemStatus(str, Enum):
    available = "available"
    in_use = "in_use"
    faulty = "faulty"
    retired = "retired"


class ItemType(str, Enum):
    asset = "asset"
    consumable = "consumable"


class UserRole(str, Enum):
    admin = "admin"
    manager = "manager"
    viewer = "viewer"


class AuditAction(str, Enum):
    create = "create"
    update = "update"
    delete = "delete"


class BOMStatus(str, Enum):
    draft = "draft"
    submitted = "submitted"
    fulfilled = "fulfilled"


# ── Auth / Users ───────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str


class UserOut(BaseModel):
    id: int
    username: str
    role: UserRole
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.viewer


class UserUpdate(BaseModel):
    role: Optional[UserRole] = None
    password: Optional[str] = Field(default=None, min_length=6)
    is_active: Optional[bool] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryFlat(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    parent_id: Optional[int] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    parent_id: Optional[int] = None


# ── Inventory ─────────────────────────────────────────────────────────────────

class CategoryRef(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None

    model_config = {"from_attributes": True}


class InventoryItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category_id: Optional[int] = None
    item_type: ItemType = ItemType.asset
    quantity: int = Field(default=0, ge=0)
    location: Optional[str] = Field(default=None, max_length=255)
    status: ItemStatus = ItemStatus.available
    description: Optional[str] = None
    minimum_stock: Optional[int] = Field(default=None, ge=0)
    lead_time_days: Optional[int] = Field(default=None, ge=0)


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category_id: Optional[int] = None
    item_type: Optional[ItemType] = None
    quantity: Optional[int] = Field(default=None, ge=0)
    location: Optional[str] = Field(default=None, max_length=255)
    status: Optional[ItemStatus] = None
    description: Optional[str] = None
    minimum_stock: Optional[int] = Field(default=None, ge=0)
    lead_time_days: Optional[int] = Field(default=None, ge=0)


class InventoryItemOut(BaseModel):
    id: int
    name: str
    category_id: Optional[int] = None
    category: Optional[CategoryRef] = None
    item_type: ItemType
    quantity: int
    location: Optional[str]
    status: ItemStatus
    description: Optional[str]
    minimum_stock: Optional[int] = None
    lead_time_days: Optional[int] = None
    date_added: datetime
    last_updated: datetime
    last_verified: Optional[datetime]

    model_config = {"from_attributes": True}


class ReorderAlertOut(InventoryItemOut):
    shortfall: int
    urgency: str  # "critical" | "warning"


# ── Audit ─────────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int]
    username: Optional[str]
    action: AuditAction
    entity_type: str
    entity_id: Optional[int]
    entity_name: Optional[str]
    changes: Optional[Dict[str, Any]]
    timestamp: datetime

    model_config = {"from_attributes": True}


# ── BOMs ──────────────────────────────────────────────────────────────────────

class BOMCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


class BOMUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None


class BOMItemCreate(BaseModel):
    inventory_item_id: int
    quantity_needed: int = Field(default=1, ge=1)


class BOMItemUpdate(BaseModel):
    quantity_needed: int = Field(..., ge=1)


class BOMItemOut(BaseModel):
    id: int
    bom_id: int
    inventory_item_id: int
    quantity_needed: int
    item_name: Optional[str] = None
    item_category_id: Optional[int] = None
    item_category_name: Optional[str] = None
    item_type: Optional[str] = None
    quantity_in_stock: int = 0
    quantity_to_order: int = 0


class BOMOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_by: Optional[int] = None
    creator_username: Optional[str] = None
    created_at: datetime
    status: BOMStatus
    items: List[BOMItemOut] = []


# ── Netbox ─────────────────────────────────────────────────────────────────────

class NetboxConfigOut(BaseModel):
    id: int
    mode: str
    api_url: Optional[str] = None
    has_token: bool = False
    auto_sync_interval_minutes: int
    last_sync_at: Optional[datetime] = None
    last_sync_status: Optional[str] = None

    model_config = {"from_attributes": True}


class NetboxConfigUpdate(BaseModel):
    mode: Optional[str] = None
    api_url: Optional[str] = None
    token: Optional[str] = None  # plaintext; encrypted on write
    auto_sync_interval_minutes: Optional[int] = Field(default=None, ge=0)


class NetboxSiteOut(BaseModel):
    id: int
    netbox_id: int
    name: str
    slug: str
    description: Optional[str] = None
    synced_at: Optional[datetime] = None
    rack_count: int = 0

    model_config = {"from_attributes": True}


class NetboxRackOut(BaseModel):
    id: int
    netbox_id: int
    name: str
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    location: Optional[str] = None
    u_height: int
    description: Optional[str] = None
    device_count: int = 0

    model_config = {"from_attributes": True}


class NetboxDeviceTypeOut(BaseModel):
    id: int
    netbox_id: int
    manufacturer: Optional[str] = None
    model: str
    slug: Optional[str] = None
    u_height: int
    inventory_category_id: Optional[int] = None
    inventory_category_name: Optional[str] = None

    model_config = {"from_attributes": True}


class NetboxDeviceOut(BaseModel):
    id: int
    netbox_id: int
    name: Optional[str] = None
    rack_id: Optional[int] = None
    device_type_id: Optional[int] = None
    device_type_model: Optional[str] = None
    device_type_manufacturer: Optional[str] = None
    role: Optional[str] = None
    position: Optional[int] = None
    face: Optional[str] = None

    model_config = {"from_attributes": True}


class DeviceTypeMappingUpdate(BaseModel):
    inventory_category_id: Optional[int] = None


class CloneRackRequest(BaseModel):
    netbox_rack_id: int
    destination_site: Optional[str] = None
    create_bom: bool = False
    bom_name: Optional[str] = None


class CloneRackLineItem(BaseModel):
    device_type_model: str
    device_type_manufacturer: Optional[str] = None
    inventory_category_id: Optional[int] = None
    inventory_category_name: Optional[str] = None
    matched_inventory_item_id: Optional[int] = None
    matched_inventory_item_name: Optional[str] = None
    quantity_needed: int
    quantity_in_stock: int
    quantity_to_order: int
    optic_flags: List[Dict[str, Any]] = []


class CloneRackResult(BaseModel):
    rack_name: str
    site_name: Optional[str] = None
    destination_site: Optional[str] = None
    total_device_types: int
    line_items: List[CloneRackLineItem]
    bom_id: Optional[int] = None
    bom_name: Optional[str] = None


# ── Optic compatibility ────────────────────────────────────────────────────────

class OpticCompatibilityOut(BaseModel):
    id: int
    transceiver_model: str
    compatible_platforms: List[str] = []
    incompatible_platforms: List[str] = []
    notes: Optional[str] = None
    compat_level: str
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OpticCompatibilityCreate(BaseModel):
    transceiver_model: str = Field(..., min_length=1, max_length=255)
    compatible_platforms: List[str] = []
    incompatible_platforms: List[str] = []
    notes: Optional[str] = None
    compat_level: str = "unverified"


class OpticCompatibilityUpdate(BaseModel):
    transceiver_model: Optional[str] = Field(default=None, min_length=1, max_length=255)
    compatible_platforms: Optional[List[str]] = None
    incompatible_platforms: Optional[List[str]] = None
    notes: Optional[str] = None
    compat_level: Optional[str] = None


# ── User preferences ───────────────────────────────────────────────────────────

class UserPreferencesOut(BaseModel):
    theme: str
    accent_color: str

    model_config = {"from_attributes": True}


class UserPreferencesUpdate(BaseModel):
    theme: Optional[str] = None  # dark | light | system
    accent_color: Optional[str] = None  # hex color


class CompanySettingsOut(BaseModel):
    logo_url: Optional[str] = None
