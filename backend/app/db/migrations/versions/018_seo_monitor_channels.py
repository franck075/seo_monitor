"""018 seo_monitor_channels: add channels array to seo_monitors

Revision ID: 018_seo_monitor_channels
Revises: 017_team
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = "018_seo_monitor_channels"
down_revision = "017_team"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "seo_monitors",
        sa.Column("channels", ARRAY(sa.String()), nullable=False, server_default="{}"),
    )


def downgrade():
    op.drop_column("seo_monitors", "channels")
