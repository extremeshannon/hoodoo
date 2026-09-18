"""dye-sub jobs

Revision ID: d7e5ub41ea01
Revises: c8f4a1b2d3e4
Create Date: 2026-09-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d7e5ub41ea01"
down_revision: Union[str, Sequence[str], None] = "c8f4a1b2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dyesub_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("garment_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False, server_default="Untitled print"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="draft"),
        sa.Column("layout", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dyesub_jobs_user_id", "dyesub_jobs", ["user_id"], unique=False)
    op.create_table(
        "dyesub_art",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime", sa.String(length=80), nullable=False, server_default="image/png"),
        sa.Column("byte_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["dyesub_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dyesub_art_job_id", "dyesub_art", ["job_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_dyesub_art_job_id", table_name="dyesub_art")
    op.drop_table("dyesub_art")
    op.drop_index("ix_dyesub_jobs_user_id", table_name="dyesub_jobs")
    op.drop_table("dyesub_jobs")
