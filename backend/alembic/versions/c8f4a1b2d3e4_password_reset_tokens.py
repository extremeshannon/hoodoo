"""password_reset_tokens

Revision ID: c8f4a1b2d3e4
Revises: 72bb3bf2d7cb
Create Date: 2026-04-02

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c8f4a1b2d3e4"
down_revision: Union[str, Sequence[str], None] = "72bb3bf2d7cb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_sha256", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_password_reset_tokens_token_sha256"),
        "password_reset_tokens",
        ["token_sha256"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_password_reset_tokens_token_sha256"), table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
