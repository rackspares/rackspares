"""v0.5.5 add sites table and site_id FK to users/inventory_items

Revision ID: 001
Revises:
Create Date: 2026-03-28

All operations are defensive (check-first) so the migration is safe to run
whether the tables were just created by SQLAlchemy's create_all() on a fresh
install or are being applied to an existing database.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_tables = set(insp.get_table_names())

    # ── sites table ────────────────────────────────────────────────────────────
    if "sites" not in existing_tables:
        op.create_table(
            "sites",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String(100), nullable=False, unique=True),
            sa.Column("short_code", sa.String(20), nullable=False, unique=True),
            sa.Column("address", sa.Text, nullable=True),
            sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
        )
        print("[alembic 001] created sites table")

    # ── users.site_id ──────────────────────────────────────────────────────────
    if "users" in existing_tables:
        user_cols = {c["name"] for c in insp.get_columns("users")}
        if "site_id" not in user_cols:
            op.add_column(
                "users",
                sa.Column(
                    "site_id",
                    sa.Integer,
                    sa.ForeignKey("sites.id", ondelete="SET NULL"),
                    nullable=True,
                ),
            )
            print("[alembic 001] added users.site_id")

    # ── inventory_items.site_id ────────────────────────────────────────────────
    if "inventory_items" in existing_tables:
        inv_cols = {c["name"] for c in insp.get_columns("inventory_items")}
        if "site_id" not in inv_cols:
            op.add_column(
                "inventory_items",
                sa.Column(
                    "site_id",
                    sa.Integer,
                    sa.ForeignKey("sites.id", ondelete="SET NULL"),
                    nullable=True,
                ),
            )
            print("[alembic 001] added inventory_items.site_id")


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    if "inventory_items" in insp.get_table_names():
        if "site_id" in {c["name"] for c in insp.get_columns("inventory_items")}:
            op.drop_column("inventory_items", "site_id")

    if "users" in insp.get_table_names():
        if "site_id" in {c["name"] for c in insp.get_columns("users")}:
            op.drop_column("users", "site_id")

    if "sites" in insp.get_table_names():
        op.drop_table("sites")
