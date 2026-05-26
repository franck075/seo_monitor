"""019 keyword_clusters: rule-based keyword clustering definitions

Revision ID: 019_keyword_clusters
Revises: 018_seo_monitor_channels
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = "019_keyword_clusters"
down_revision = "018_seo_monitor_channels"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "keyword_clusters",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("website_id", sa.Integer(), sa.ForeignKey("websites.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#3b82f6"),
        sa.Column("terms", ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("is_brand", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_keyword_clusters_website_id", "keyword_clusters", ["website_id"])


def downgrade():
    op.drop_table("keyword_clusters")
