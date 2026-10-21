"""Durable, exact LEAF reward accounting independent of testnet state."""
from alembic import op
import sqlalchemy as sa

revision = "0004_leaf_rewards"
down_revision = "0003_stellar_intents"
branch_labels = None
depends_on = None


def upgrade():
    book = op.create_table("reward_books",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("head_hash", sa.String(64), nullable=False))
    op.bulk_insert(book, [{"id": 1, "revision": 0, "head_hash": "0" * 64}])
    op.create_table("reward_events",
        sa.Column("sequence", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(200), nullable=False, unique=True),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("recorded_at", sa.String(40), nullable=False),
        sa.Column("previous_hash", sa.String(64), nullable=False),
        sa.Column("event_hash", sa.String(64), nullable=False, unique=True))


def downgrade():
    raise RuntimeError("Reward history must not be dropped by downgrade. Export and review recovery first.")
