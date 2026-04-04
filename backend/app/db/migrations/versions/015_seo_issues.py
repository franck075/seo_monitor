"""015 seo issues and alert configs

Revision ID: 015_seo_issues
Revises: 014_hack_detections
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, ARRAY

revision = "015_seo_issues"
down_revision = "014_hack_detections"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "seo_issues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("website_id", sa.Integer(), sa.ForeignKey("websites.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issue_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("url", sa.String(2000)),
        sa.Column("detail", sa.Text()),
        sa.Column("data", JSONB()),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("is_resolved", sa.Boolean(), server_default="false"),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_seo_issues_website_id", "seo_issues", ["website_id"])
    op.create_index("ix_seo_issues_issue_type", "seo_issues", ["issue_type"])
    op.create_index("ix_seo_issues_detected_at", "seo_issues", ["detected_at"])

    op.create_table(
        "seo_issue_alert_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("website_id", sa.Integer(), sa.ForeignKey("websites.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issue_type", sa.String(50), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="true"),
        sa.Column("frequency", sa.String(20), server_default="weekly"),
        sa.Column("threshold", sa.Integer()),
        sa.Column("channels", ARRAY(sa.String()), server_default="{}"),
        sa.Column("last_notified_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("website_id", "issue_type", name="uq_seo_issue_alert_config"),
    )


def downgrade():
    op.drop_table("seo_issue_alert_configs")
    op.drop_table("seo_issues")
