import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from database import Base, SessionLocal, engine
import models
from routers import auth, inventory
from routers.audit import router as audit_router
from routers.auth import hash_password


def run_migrations():
    """
    Idempotent schema migrations for v0.2.0.
    Adds new columns to existing tables so the database doesn't need to be
    recreated when upgrading from v0.1.0.
    """
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())

    with engine.begin() as conn:
        # ── users table ───────────────────────────────────────────────────────
        if "users" in existing_tables:
            users_cols = {c["name"] for c in insp.get_columns("users")}

            if "role" not in users_cols:
                # Create the Postgres enum type if it doesn't exist yet
                conn.execute(text("""
                    DO $$ BEGIN
                        CREATE TYPE userrole AS ENUM ('admin', 'manager', 'viewer');
                    EXCEPTION WHEN duplicate_object THEN NULL;
                    END $$;
                """))
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN role userrole NOT NULL DEFAULT 'viewer'"
                ))
                # Carry over the old is_admin flag if that column still exists
                if "is_admin" in users_cols:
                    conn.execute(text(
                        "UPDATE users SET role = 'admin' WHERE is_admin = true"
                    ))
                print("[rackspares] migration: added users.role")

            # Drop the old is_admin column — data is now in role
            if "is_admin" in users_cols:
                conn.execute(text("ALTER TABLE users DROP COLUMN is_admin"))
                print("[rackspares] migration: dropped users.is_admin")

            if "is_active" not in users_cols:
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true"
                ))
                print("[rackspares] migration: added users.is_active")

        # ── inventory_items table ─────────────────────────────────────────────
        if "inventory_items" in existing_tables:
            inv_cols = {c["name"] for c in insp.get_columns("inventory_items")}
            if "last_verified" not in inv_cols:
                conn.execute(text(
                    "ALTER TABLE inventory_items"
                    " ADD COLUMN last_verified TIMESTAMP WITH TIME ZONE"
                ))
                print("[rackspares] migration: added inventory_items.last_verified")

        # ── enum type for audit_logs (needed before create_all) ───────────────
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE auditaction AS ENUM ('create', 'update', 'delete');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()

    # Create any tables that don't exist yet (safe — skips existing ones)
    Base.metadata.create_all(bind=engine)

    # Seed admin user
    db = SessionLocal()
    try:
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
    finally:
        db.close()

    yield


app = FastAPI(title="RackSpares API", version="0.2.0", lifespan=lifespan)

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


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "version": "0.2.0"}
