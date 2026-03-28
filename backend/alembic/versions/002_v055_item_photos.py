"""v0.5.5 add item_photos table

Revision ID: 002
Revises: 001
Create Date: 2026-03-28

Stores photo attachments for both consumable and asset inventory items.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    existing_tables = set(insp.get_table_names())

    if "item_photos" not in existing_tables:
        op.create_table(
            "item_photos",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column(
                "item_id",
                sa.Integer,
                sa.ForeignKey("inventory_items.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column("storage_path", sa.String(512), nullable=False),
            sa.Column(
                "uploaded_by",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "uploaded_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("label", sa.String(255), nullable=True),
        )
        print("[alembic 002] created item_photos table")


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "item_photos" in insp.get_table_names():
        op.drop_table("item_photos")
