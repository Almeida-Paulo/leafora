"""Add project catalog fields, tiers and milestones.

Revision ID: 0002_project_catalog_schema
Revises: 0001_initial_schema
Create Date: 2026-06-27
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0002_project_catalog_schema"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("image_uri", sa.Text(), nullable=False, server_default=""))
    op.add_column(
        "projects",
        sa.Column("display_status", sa.String(length=80), nullable=False, server_default=""),
    )

    op.create_table(
        "project_milestones",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("target_amount_mist", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_milestones_project_id", "project_milestones", ["project_id"])
    op.create_index("ix_project_milestones_status", "project_milestones", ["status"])

    op.create_table(
        "project_tiers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("amount_mist", sa.BigInteger(), nullable=False),
        sa.Column("allocation_points", sa.BigInteger(), nullable=False),
        sa.Column("chain_tier", sa.Integer(), nullable=False),
        sa.Column("metadata_uri", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_tiers_is_active", "project_tiers", ["is_active"])
    op.create_index("ix_project_tiers_project_id", "project_tiers", ["project_id"])

    op.alter_column("projects", "image_uri", server_default=None)
    op.alter_column("projects", "display_status", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_project_tiers_project_id", table_name="project_tiers")
    op.drop_index("ix_project_tiers_is_active", table_name="project_tiers")
    op.drop_table("project_tiers")

    op.drop_index("ix_project_milestones_status", table_name="project_milestones")
    op.drop_index("ix_project_milestones_project_id", table_name="project_milestones")
    op.drop_table("project_milestones")

    op.drop_column("projects", "display_status")
    op.drop_column("projects", "image_uri")
