"""016 cms tables: announcements, blog_posts, site_settings, client_logos

Revision ID: 016_cms
Revises: 015_seo_issues
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, ARRAY

revision = "016_cms"
down_revision = "015_seo_issues"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("type", sa.String(50), nullable=False, server_default="info"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_announcements_id", "announcements", ["id"])

    op.create_table(
        "blog_posts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(255), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("cover_image", sa.String(500), nullable=True),
        sa.Column("meta_title", sa.String(255), nullable=True),
        sa.Column("meta_description", sa.String(500), nullable=True),
        sa.Column("canonical_url", sa.String(500), nullable=True),
        sa.Column("structured_data", JSONB(), nullable=True),
        sa.Column("tags", ARRAY(sa.Text()), nullable=True),
        sa.Column("author", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_blog_posts_id", "blog_posts", ["id"])
    op.create_index("ix_blog_posts_slug", "blog_posts", ["slug"])
    op.create_index("ix_blog_posts_status", "blog_posts", ["status"])

    op.create_table(
        "site_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(100), nullable=False, unique=True),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_site_settings_id", "site_settings", ["id"])
    op.create_index("ix_site_settings_key", "site_settings", ["key"])

    op.create_table(
        "client_logos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("logo_url", sa.String(500), nullable=False),
        sa.Column("website_url", sa.String(500), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_client_logos_id", "client_logos", ["id"])


def downgrade():
    op.drop_table("client_logos")
    op.drop_table("site_settings")
    op.drop_table("blog_posts")
    op.drop_table("announcements")
