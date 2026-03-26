import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
from database import Base


class ItemStatus(str, enum.Enum):
    available = "available"
    in_use = "in_use"
    faulty = "faulty"
    retired = "retired"


class ItemType(str, enum.Enum):
    asset = "asset"
    consumable = "consumable"


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    viewer = "viewer"


class AuditAction(str, enum.Enum):
    create = "create"
    update = "update"
    delete = "delete"


class BOMStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    fulfilled = "fulfilled"


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.viewer, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True)
    item_type = Column(Enum(ItemType), default=ItemType.asset, nullable=False)
    quantity = Column(Integer, default=0, nullable=False)
    minimum_stock = Column(Integer, nullable=True)
    lead_time_days = Column(Integer, nullable=True)
    location = Column(String(255))
    status = Column(Enum(ItemStatus), default=ItemStatus.available, nullable=False)
    description = Column(Text)
    date_added = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_updated = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    last_verified = Column(DateTime(timezone=True), nullable=True)

    category = relationship("Category", foreign_keys=[category_id])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username = Column(String(50), nullable=True)
    action = Column(Enum(AuditAction), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=True)
    entity_name = Column(String(255), nullable=True)
    changes = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class BOM(Base):
    __tablename__ = "boms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    status = Column(Enum(BOMStatus), default=BOMStatus.draft, nullable=False)

    items = relationship("BOMItem", back_populates="bom", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])


class BOMItem(Base):
    __tablename__ = "bom_items"

    id = Column(Integer, primary_key=True, index=True)
    bom_id = Column(Integer, ForeignKey("boms.id", ondelete="CASCADE"), nullable=False)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    quantity_needed = Column(Integer, nullable=False, default=1)

    bom = relationship("BOM", back_populates="items")
    inventory_item = relationship("InventoryItem")
