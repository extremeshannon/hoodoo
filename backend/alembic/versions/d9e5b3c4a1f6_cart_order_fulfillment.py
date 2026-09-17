"""cart and order fulfillment / shipping totals

Revision ID: d9e5b3c4a1f6
Revises: c8f4a1b2d3e4
Create Date: 2026-09-17

"""

from typing import Sequence, Union

from alembic import op

revision: str = "d9e5b3c4a1f6"
down_revision: Union[str, Sequence[str], None] = "c8f4a1b2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE carts ADD COLUMN IF NOT EXISTS fulfillment JSONB")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment JSONB")
    op.execute(
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0"
    )
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS total NUMERIC(12,2)")
    op.execute("UPDATE orders SET total = COALESCE(total, subtotal + COALESCE(shipping_amount, 0))")
    op.execute("ALTER TABLE orders ALTER COLUMN total SET DEFAULT 0")
    op.execute("ALTER TABLE orders ALTER COLUMN total SET NOT NULL")


def downgrade() -> None:
    op.drop_column("orders", "total")
    op.drop_column("orders", "shipping_amount")
    op.drop_column("orders", "fulfillment")
    op.drop_column("carts", "fulfillment")
