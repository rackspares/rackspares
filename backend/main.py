import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from database import Base, SessionLocal, engine
import models
from routers import auth, inventory
from routers.audit import router as audit_router
from routers.categories import router as categories_router
from routers.boms import router as boms_router
from routers.netbox import router as netbox_router
from routers.optics import router as optics_router
from routers.preferences import router as preferences_router
from routers.services import router as services_router
from routers.auth import hash_password

DEFAULT_CATEGORIES = [
    ("Servers", None),
    ("Networking", None),
    ("Storage", None),
    ("Power", None),
    ("Cables & Transceivers", None),
    ("Memory & CPUs", None),
    ("Cooling", None),
    ("Tools & Consumables", None),
]


def run_migrations():
    """
    Idempotent schema migrations for v0.2.0, v0.3.0, and v0.4.0.
    Adds new columns/tables to existing database without recreation.
    """
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())

    with engine.begin() as conn:
        # ── v0.2.0: users table ───────────────────────────────────────────────
        if "users" in existing_tables:
            users_cols = {c["name"] for c in insp.get_columns("users")}

            if "role" not in users_cols:
                conn.execute(text("""
                    DO $$ BEGIN
                        CREATE TYPE userrole AS ENUM ('admin', 'manager', 'viewer');
                    EXCEPTION WHEN duplicate_object THEN NULL;
                    END $$;
                """))
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN role userrole NOT NULL DEFAULT 'viewer'"
                ))
                if "is_admin" in users_cols:
                    conn.execute(text(
                        "UPDATE users SET role = 'admin' WHERE is_admin = true"
                    ))
                print("[rackspares] migration: added users.role")

            if "is_admin" in users_cols:
                conn.execute(text("ALTER TABLE users DROP COLUMN is_admin"))
                print("[rackspares] migration: dropped users.is_admin")

            if "is_active" not in users_cols:
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true"
                ))
                print("[rackspares] migration: added users.is_active")

        # ── v0.2.0: inventory_items.last_verified ─────────────────────────────
        if "inventory_items" in existing_tables:
            inv_cols = {c["name"] for c in insp.get_columns("inventory_items")}
            if "last_verified" not in inv_cols:
                conn.execute(text(
                    "ALTER TABLE inventory_items"
                    " ADD COLUMN last_verified TIMESTAMP WITH TIME ZONE"
                ))
                print("[rackspares] migration: added inventory_items.last_verified")

        # ── v0.2.0: audit action enum ─────────────────────────────────────────
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE auditaction AS ENUM ('create', 'update', 'delete');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))

        # ── v0.3.0: new enum types ────────────────────────────────────────────
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE itemtype AS ENUM ('asset', 'consumable');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE bomstatus AS ENUM ('draft', 'submitted', 'fulfilled');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))

        # ── v0.3.0: categories table (must exist before FK on inventory_items) ─
        if "categories" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE categories (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            conn.execute(text("CREATE INDEX ix_categories_name ON categories(name)"))
            print("[rackspares] migration: created categories table")

        # ── v0.3.0: inventory_items new columns ───────────────────────────────
        if "inventory_items" in existing_tables:
            inv_cols = {c["name"] for c in insp.get_columns("inventory_items")}

            if "item_type" not in inv_cols:
                conn.execute(text(
                    "ALTER TABLE inventory_items"
                    " ADD COLUMN item_type itemtype NOT NULL DEFAULT 'asset'"
                ))
                print("[rackspares] migration: added inventory_items.item_type")

            if "minimum_stock" not in inv_cols:
                conn.execute(text(
                    "ALTER TABLE inventory_items ADD COLUMN minimum_stock INTEGER"
                ))
                print("[rackspares] migration: added inventory_items.minimum_stock")

            if "lead_time_days" not in inv_cols:
                conn.execute(text(
                    "ALTER TABLE inventory_items ADD COLUMN lead_time_days INTEGER"
                ))
                print("[rackspares] migration: added inventory_items.lead_time_days")

            if "category_id" not in inv_cols and "category" in inv_cols:
                conn.execute(text(
                    "ALTER TABLE inventory_items"
                    " ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT"
                ))
                rows = conn.execute(text(
                    "SELECT DISTINCT category FROM inventory_items WHERE category IS NOT NULL AND category != ''"
                )).fetchall()
                for (cat_name,) in rows:
                    result = conn.execute(
                        text("INSERT INTO categories(name) VALUES (:n) RETURNING id"),
                        {"n": cat_name},
                    )
                    cat_id = result.fetchone()[0]
                    conn.execute(
                        text("UPDATE inventory_items SET category_id = :cid WHERE category = :n"),
                        {"cid": cat_id, "n": cat_name},
                    )
                conn.execute(text("ALTER TABLE inventory_items DROP COLUMN category"))
                print("[rackspares] migration: migrated inventory_items.category → category_id FK")

            elif "category_id" not in inv_cols:
                conn.execute(text(
                    "ALTER TABLE inventory_items"
                    " ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT"
                ))
                print("[rackspares] migration: added inventory_items.category_id")

        # ── v0.4.0: netbox_config ─────────────────────────────────────────────
        if "netbox_config" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE netbox_config (
                    id SERIAL PRIMARY KEY,
                    mode VARCHAR(20) NOT NULL DEFAULT 'external',
                    api_url VARCHAR(500),
                    encrypted_token TEXT,
                    auto_sync_interval_minutes INTEGER NOT NULL DEFAULT 0,
                    last_sync_at TIMESTAMP WITH TIME ZONE,
                    last_sync_status VARCHAR(255),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            print("[rackspares] migration: created netbox_config table")

        # ── v0.4.0: netbox_sites ──────────────────────────────────────────────
        if "netbox_sites" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE netbox_sites (
                    id SERIAL PRIMARY KEY,
                    netbox_id INTEGER NOT NULL UNIQUE,
                    name VARCHAR(255) NOT NULL,
                    slug VARCHAR(255) NOT NULL,
                    description TEXT,
                    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            print("[rackspares] migration: created netbox_sites table")

        # ── v0.4.0: netbox_racks ──────────────────────────────────────────────
        if "netbox_racks" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE netbox_racks (
                    id SERIAL PRIMARY KEY,
                    netbox_id INTEGER NOT NULL UNIQUE,
                    name VARCHAR(255) NOT NULL,
                    site_id INTEGER REFERENCES netbox_sites(id) ON DELETE CASCADE,
                    location VARCHAR(255),
                    u_height INTEGER DEFAULT 42,
                    description TEXT,
                    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            print("[rackspares] migration: created netbox_racks table")

        # ── v0.4.0: netbox_device_types ───────────────────────────────────────
        if "netbox_device_types" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE netbox_device_types (
                    id SERIAL PRIMARY KEY,
                    netbox_id INTEGER NOT NULL UNIQUE,
                    manufacturer VARCHAR(255),
                    model VARCHAR(255) NOT NULL,
                    slug VARCHAR(255),
                    u_height INTEGER DEFAULT 1,
                    inventory_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            print("[rackspares] migration: created netbox_device_types table")

        # ── v0.4.0: netbox_devices ────────────────────────────────────────────
        if "netbox_devices" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE netbox_devices (
                    id SERIAL PRIMARY KEY,
                    netbox_id INTEGER NOT NULL UNIQUE,
                    name VARCHAR(255),
                    rack_id INTEGER REFERENCES netbox_racks(id) ON DELETE CASCADE,
                    device_type_id INTEGER REFERENCES netbox_device_types(id) ON DELETE SET NULL,
                    role VARCHAR(255),
                    position INTEGER,
                    face VARCHAR(10),
                    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            print("[rackspares] migration: created netbox_devices table")

        # ── v0.4.0: optic_compatibility ───────────────────────────────────────
        if "optic_compatibility" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE optic_compatibility (
                    id SERIAL PRIMARY KEY,
                    transceiver_model VARCHAR(255) NOT NULL,
                    compatible_platforms JSONB DEFAULT '[]',
                    incompatible_platforms JSONB DEFAULT '[]',
                    notes TEXT,
                    compat_level VARCHAR(20) NOT NULL DEFAULT 'unverified',
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            conn.execute(text(
                "CREATE INDEX ix_optic_compatibility_model ON optic_compatibility(transceiver_model)"
            ))
            print("[rackspares] migration: created optic_compatibility table")

        # ── v0.4.0: user_preferences ──────────────────────────────────────────
        if "user_preferences" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE user_preferences (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                    theme VARCHAR(10) NOT NULL DEFAULT 'dark',
                    accent_color VARCHAR(7) NOT NULL DEFAULT '#2563eb',
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            print("[rackspares] migration: created user_preferences table")

        # ── v0.4.0: company_settings ──────────────────────────────────────────
        if "company_settings" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE company_settings (
                    id SERIAL PRIMARY KEY,
                    logo_filename VARCHAR(255),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            print("[rackspares] migration: created company_settings table")

        # ── v0.5.1: company_settings.setup_wizard_completed ──────────────────
        if "company_settings" in existing_tables:
            cs_cols = {c["name"] for c in insp.get_columns("company_settings")}
            if "setup_wizard_completed" not in cs_cols:
                conn.execute(text(
                    "ALTER TABLE company_settings"
                    " ADD COLUMN setup_wizard_completed BOOLEAN NOT NULL DEFAULT false"
                ))
                print("[rackspares] migration: added company_settings.setup_wizard_completed")

        # ── v0.5.1: service_configs ───────────────────────────────────────────
        if "service_configs" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE service_configs (
                    id SERIAL PRIMARY KEY,
                    service_name VARCHAR(50) NOT NULL UNIQUE,
                    url VARCHAR(500),
                    encrypted_credentials TEXT,
                    is_connected BOOLEAN NOT NULL DEFAULT false,
                    last_tested_at TIMESTAMP WITH TIME ZONE,
                    last_test_status VARCHAR(500),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """))
            print("[rackspares] migration: created service_configs table")

        # ── v0.5.0: inventory_items.serial_number ─────────────────────────────
        if "inventory_items" in existing_tables:
            inv_cols = {c["name"] for c in insp.get_columns("inventory_items")}
            if "serial_number" not in inv_cols:
                conn.execute(text(
                    "ALTER TABLE inventory_items"
                    " ADD COLUMN serial_number VARCHAR(255) UNIQUE"
                ))
                print("[rackspares] migration: added inventory_items.serial_number")


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()

    # Create any tables that don't exist yet (safe — skips existing ones)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Seed admin user
        admin_username = os.getenv("ADMIN_USERNAME", "admin")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin")
        if not db.query(models.User).filter(models.User.username == admin_username).first():
            db.add(models.User(
                username=admin_username,
                hashed_password=hash_password(admin_password),
                role=models.UserRole.admin,
                is_active=True,
            ))
            db.commit()
            print(f"[rackspares] Created admin user: {admin_username}")

        # Seed default categories if none exist
        if db.query(models.Category).count() == 0:
            admin = db.query(models.User).filter(models.User.username == admin_username).first()
            admin_id = admin.id if admin else None
            for name, parent_id in DEFAULT_CATEGORIES:
                db.add(models.Category(name=name, parent_id=parent_id, created_by=admin_id))
            db.commit()
            print("[rackspares] Seeded default categories")
    finally:
        db.close()

    yield


app = FastAPI(
    title="RackSpares API",
    version="0.5.1",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    description=(
        "RackSpares inventory management API. "
        "All endpoints (except /api/health) require a Bearer token obtained from POST /api/auth/login."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])
app.include_router(audit_router, prefix="/api/audit", tags=["audit"])
app.include_router(categories_router, prefix="/api/categories", tags=["categories"])
app.include_router(boms_router, prefix="/api/boms", tags=["boms"])
app.include_router(netbox_router, prefix="/api/netbox", tags=["netbox"])
app.include_router(optics_router, prefix="/api/optics", tags=["optics"])
app.include_router(preferences_router, prefix="/api/preferences", tags=["preferences"])
app.include_router(services_router, prefix="/api/services", tags=["services"])


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "version": "0.5.1"}
