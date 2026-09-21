"""embroidery jobs

Revision ID: f9b8ce54fd23
Revises: e8f6ac42fb12
Create Date: 2026-09-21

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f9b8ce54fd23"
down_revision: Union[str, Sequence[str], None] = "e8f6ac42fb12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "embroidery_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("garment_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False, server_default="Untitled embroidery"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="draft"),
        sa.Column("layout", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_embroidery_jobs_user_id", "embroidery_jobs", ["user_id"], unique=False)
    op.create_table(
        "embroidery_art",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime", sa.String(length=80), nullable=False, server_default="image/png"),
        sa.Column("byte_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["embroidery_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_embroidery_art_job_id", "embroidery_art", ["job_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_embroidery_art_job_id", table_name="embroidery_art")
    op.drop_table("embroidery_art")
    op.drop_index("ix_embroidery_jobs_user_id", table_name="embroidery_jobs")
    op.drop_table("embroidery_jobs")
