"""Persist exact unsigned envelopes for non-custodial Stellar signing."""
from alembic import op
import sqlalchemy as sa

revision = "0003_stellar_intents"
down_revision = "0002_project_catalog_schema"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("stellar_intents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("network", sa.String(16), nullable=False),
        sa.Column("contract", sa.String(56), nullable=False),
        sa.Column("wallet", sa.String(56), nullable=False),
        sa.Column("tx_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("xdr", sa.Text(), nullable=False),
        sa.Column("expires", sa.BigInteger(), nullable=False))
    op.create_index("ix_stellar_intents_wallet", "stellar_intents", ["wallet"])
    op.create_index("ix_stellar_intents_expires", "stellar_intents", ["expires"])


def downgrade():
    op.drop_table("stellar_intents")
