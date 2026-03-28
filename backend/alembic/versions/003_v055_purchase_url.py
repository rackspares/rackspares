"""v0.5.5 add purchase_url to inventory_items

Revision ID: 003
Revises: 002
Create Date: 2026-03-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("inventory_items")}
    if "purchase_url" not in cols:
        op.add_column("inventory_items", sa.Column("purchase_url", sa.Text, nullable=True))
        print("[alembic 003] added inventory_items.purchase_url")


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("inventory_items")}
    if "purchase_url" in cols:
        op.drop_column("inventory_items", "purchase_url")
