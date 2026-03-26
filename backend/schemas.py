from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class ItemStatus(str, Enum):
    available = "available"
    in_use = "in_use"
    faulty = "faulty"
    retired = "retired"


class UserRole(str, Enum):
    admin = "admin"
    manager = "manager"
    viewer = "viewer"


class AuditAction(str, Enum):
    create = "create"
    update = "update"
    delete = "delete"


# --- Auth / Users ---

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


# --- Inventory ---

class InventoryItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: str = Field(..., min_length=1, max_length=100)
    quantity: int = Field(default=0, ge=0)
    location: Optional[str] = Field(default=None, max_length=255)
    status: ItemStatus = ItemStatus.available
    description: Optional[str] = None


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, min_length=1, max_length=100)
    quantity: Optional[int] = Field(default=None, ge=0)
    location: Optional[str] = Field(default=None, max_length=255)
    status: Optional[ItemStatus] = None
    description: Optional[str] = None


class InventoryItemOut(BaseModel):
    id: int
    name: str
    category: str
    quantity: int
    location: Optional[str]
    status: ItemStatus
    description: Optional[str]
    date_added: datetime
    last_updated: datetime
    last_verified: Optional[datetime]

    model_config = {"from_attributes": True}


# --- Audit ---

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
