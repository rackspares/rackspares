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
    Idempotent schema migrations for v0.2.0 and v0.3.0.
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
                # Add FK column, migrate text categories → category rows, drop old column
                conn.execute(text(
                    "ALTER TABLE inventory_items"
                    " ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT"
                ))
                # For each distinct old category name, insert a category row and update FKs
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


app = FastAPI(title="RackSpares API", version="0.3.0", lifespan=lifespan)

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


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "version": "0.3.0"}
