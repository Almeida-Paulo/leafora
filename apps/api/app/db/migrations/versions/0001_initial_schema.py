"""Initial Leafora API schema.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-06-18
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("biome", sa.String(length=120), nullable=False),
        sa.Column("country", sa.String(length=80), nullable=False),
        sa.Column("region", sa.String(length=120), nullable=False),
        sa.Column("location_label", sa.String(length=240), nullable=False),
        sa.Column("objective", sa.Text(), nullable=False),
        sa.Column("impact_summary", sa.Text(), nullable=False),
        sa.Column("story", sa.Text(), nullable=False),
        sa.Column("risks", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("verification_level", sa.Integer(), nullable=False),
        sa.Column("funding_goal_mist", sa.BigInteger(), nullable=False),
        sa.Column("raised_mist", sa.BigInteger(), nullable=False),
        sa.Column("sui_package_id", sa.String(length=80), nullable=False),
        sa.Column("sui_project_id", sa.String(length=80), nullable=False),
        sa.Column("sui_vault_id", sa.String(length=80), nullable=False),
        sa.Column("metadata_uri", sa.Text(), nullable=False),
        sa.Column("metadata_hash", sa.String(length=130), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_projects_slug", "projects", ["slug"], unique=True)
    op.create_index("ix_projects_status", "projects", ["status"])

    op.create_table(
        "evidence_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("content_uri", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=130), nullable=False),
        sa.Column("metadata_hash", sa.String(length=130), nullable=False),
        sa.Column("geohash", sa.String(length=32), nullable=False),
        sa.Column("latitude", sa.String(length=40), nullable=False),
        sa.Column("longitude", sa.String(length=40), nullable=False),
        sa.Column("capture_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("submitter_address", sa.String(length=80), nullable=False),
        sa.Column("sui_object_id", sa.String(length=80), nullable=False),
        sa.Column("sui_tx_digest", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evidence_records_content_hash", "evidence_records", ["content_hash"])
    op.create_index("ix_evidence_records_project_id", "evidence_records", ["project_id"])
    op.create_index("ix_evidence_records_status", "evidence_records", ["status"])

    op.create_table(
        "supports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("wallet_address", sa.String(length=80), nullable=False),
        sa.Column("tier", sa.String(length=60), nullable=False),
        sa.Column("amount_mist", sa.BigInteger(), nullable=False),
        sa.Column("allocation_points", sa.BigInteger(), nullable=False),
        sa.Column("sui_tx_digest", sa.String(length=120), nullable=False),
        sa.Column("supporter_nft_id", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_supports_project_id", "supports", ["project_id"])
    op.create_index("ix_supports_sui_tx_digest", "supports", ["sui_tx_digest"], unique=True)
    op.create_index("ix_supports_wallet_address", "supports", ["wallet_address"])


def downgrade() -> None:
    op.drop_index("ix_supports_wallet_address", table_name="supports")
    op.drop_index("ix_supports_sui_tx_digest", table_name="supports")
    op.drop_index("ix_supports_project_id", table_name="supports")
    op.drop_table("supports")

    op.drop_index("ix_evidence_records_status", table_name="evidence_records")
    op.drop_index("ix_evidence_records_project_id", table_name="evidence_records")
    op.drop_index("ix_evidence_records_content_hash", table_name="evidence_records")
    op.drop_table("evidence_records")

    op.drop_index("ix_projects_status", table_name="projects")
    op.drop_index("ix_projects_slug", table_name="projects")
    op.drop_table("projects")

