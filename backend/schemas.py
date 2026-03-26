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
