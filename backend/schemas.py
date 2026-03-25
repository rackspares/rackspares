from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ItemStatus(str, Enum):
    available = "available"
    in_use = "in_use"
    faulty = "faulty"
    retired = "retired"


# --- Auth ---

class Token(BaseModel):
    access_token: str
    token_type: str


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool

    model_config = {"from_attributes": True}


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

    model_config = {"from_attributes": True}
