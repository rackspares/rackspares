import enum
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
from database import Base


# ── Enum helpers ──────────────────────────────────────────────────────────────

class NetboxMode(str, enum.Enum):
    external = "external"
    builtin = "builtin"


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


class ItemCondition(str, enum.Enum):
    new = "new"
    used = "used"


class AuthType(str, enum.Enum):
    local = "local"
    ldap = "ldap"


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


class Site(Base):
    __tablename__ = "sites"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    short_code = Column(String(20), unique=True, nullable=False)
    address = Column(Text, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.viewer, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    auth_type = Column(Enum(AuthType), default=AuthType.local, nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    site = relationship("Site", foreign_keys=[site_id])


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
    condition = Column(Enum(ItemCondition), default=ItemCondition.new, nullable=False)
    serial_number = Column(String(255), nullable=True, unique=True)
    description = Column(Text)
    site_id = Column(Integer, ForeignKey("sites.id", ondelete="SET NULL"), nullable=True)
    date_added = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_updated = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    last_verified = Column(DateTime(timezone=True), nullable=True)

    category = relationship("Category", foreign_keys=[category_id])
    site = relationship("Site", foreign_keys=[site_id])


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


# ── Netbox integration ────────────────────────────────────────────────────────

class NetboxConfig(Base):
    __tablename__ = "netbox_config"

    id = Column(Integer, primary_key=True)
    mode = Column(String(20), default="external", nullable=False)  # external | builtin
    api_url = Column(String(500), nullable=True)
    encrypted_token = Column(Text, nullable=True)
    auto_sync_interval_minutes = Column(Integer, default=0, nullable=False)  # 0 = disabled
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_sync_status = Column(String(255), nullable=True)  # "ok" | "error: ..."
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class NetboxSite(Base):
    __tablename__ = "netbox_sites"

    id = Column(Integer, primary_key=True)
    netbox_id = Column(Integer, nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    synced_at = Column(DateTime(timezone=True), default=utcnow)

    racks = relationship("NetboxRack", back_populates="site", cascade="all, delete-orphan")


class NetboxRack(Base):
    __tablename__ = "netbox_racks"

    id = Column(Integer, primary_key=True)
    netbox_id = Column(Integer, nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    site_id = Column(Integer, ForeignKey("netbox_sites.id", ondelete="CASCADE"), nullable=True)
    location = Column(String(255), nullable=True)
    u_height = Column(Integer, default=42)
    description = Column(Text, nullable=True)
    synced_at = Column(DateTime(timezone=True), default=utcnow)

    site = relationship("NetboxSite", back_populates="racks")
    devices = relationship("NetboxDevice", back_populates="rack", cascade="all, delete-orphan")


class NetboxDeviceType(Base):
    __tablename__ = "netbox_device_types"

    id = Column(Integer, primary_key=True)
    netbox_id = Column(Integer, nullable=False, unique=True)
    manufacturer = Column(String(255), nullable=True)
    model = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=True)
    u_height = Column(Integer, default=1)
    inventory_category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    synced_at = Column(DateTime(timezone=True), default=utcnow)

    inventory_category = relationship("Category")


class NetboxDevice(Base):
    __tablename__ = "netbox_devices"

    id = Column(Integer, primary_key=True)
    netbox_id = Column(Integer, nullable=False, unique=True)
    name = Column(String(255), nullable=True)
    rack_id = Column(Integer, ForeignKey("netbox_racks.id", ondelete="CASCADE"), nullable=True)
    device_type_id = Column(Integer, ForeignKey("netbox_device_types.id", ondelete="SET NULL"), nullable=True)
    role = Column(String(255), nullable=True)
    position = Column(Integer, nullable=True)
    face = Column(String(10), nullable=True)
    synced_at = Column(DateTime(timezone=True), default=utcnow)

    rack = relationship("NetboxRack", back_populates="devices")
    device_type = relationship("NetboxDeviceType")


# ── Optic compatibility ───────────────────────────────────────────────────────

class OpticCompatibility(Base):
    __tablename__ = "optic_compatibility"

    id = Column(Integer, primary_key=True)
    transceiver_model = Column(String(255), nullable=False, index=True)
    compatible_platforms = Column(JSON, default=list)  # ["Cisco", "Arista", ...]
    incompatible_platforms = Column(JSON, default=list)
    notes = Column(Text, nullable=True)
    compat_level = Column(String(20), default="unverified", nullable=False)  # confirmed|unverified|incompatible
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ── User preferences & theming ────────────────────────────────────────────────

class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    theme = Column(String(10), default="dark", nullable=False)  # dark | light | system
    accent_color = Column(String(7), default="#2563eb", nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User")


class CompanySettings(Base):
    __tablename__ = "company_settings"

    id = Column(Integer, primary_key=True)
    logo_filename = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ServiceConfig(Base):
    __tablename__ = "service_configs"

    id = Column(Integer, primary_key=True)
    service_name = Column(String(50), nullable=False, unique=True)   # netbox | paperless | n8n
    url = Column(String(500), nullable=True)
    encrypted_credentials = Column(Text, nullable=True)              # Fernet-encrypted JSON
    is_connected = Column(Boolean, default=False, nullable=False)
    last_tested_at = Column(DateTime(timezone=True), nullable=True)
    last_test_status = Column(String(500), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ── LDAP / Active Directory ────────────────────────────────────────────────────

class LdapConfig(Base):
    __tablename__ = "ldap_config"

    id = Column(Integer, primary_key=True)
    server = Column(String(255), nullable=True)
    port = Column(Integer, default=636, nullable=False)
    base_dn = Column(String(500), nullable=True)
    bind_account = Column(String(255), nullable=True)
    bind_password_encrypted = Column(Text, nullable=True)
    user_search_filter = Column(String(500), default="(sAMAccountName={username})", nullable=False)
    use_tls = Column(Boolean, default=True, nullable=False)
    enabled = Column(Boolean, default=False, nullable=False)
