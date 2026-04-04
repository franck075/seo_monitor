"""Extend backlink_entries with richer Ahrefs all-backlinks fields

Revision ID: 008
Revises: 007
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('backlink_entries', sa.Column('is_nofollow', sa.Boolean(), nullable=True))
    op.add_column('backlink_entries', sa.Column('is_ugc', sa.Boolean(), nullable=True))
    op.add_column('backlink_entries', sa.Column('is_sponsored', sa.Boolean(), nullable=True))
    op.add_column('backlink_entries', sa.Column('is_content', sa.Boolean(), nullable=True))
    op.add_column('backlink_entries', sa.Column('is_spam', sa.Boolean(), nullable=True))
    op.add_column('backlink_entries', sa.Column('link_type', sa.String(50), nullable=True))
    op.add_column('backlink_entries', sa.Column('http_code', sa.SmallInteger(), nullable=True))
    op.add_column('backlink_entries', sa.Column('url_rating', sa.Numeric(5, 2), nullable=True))
    op.add_column('backlink_entries', sa.Column('traffic', sa.Integer(), nullable=True))
    op.add_column('backlink_entries', sa.Column('traffic_domain', sa.Integer(), nullable=True))
    op.add_column('backlink_entries', sa.Column('refdomains_source', sa.Integer(), nullable=True))
    op.add_column('backlink_entries', sa.Column('snippet_left', sa.Text(), nullable=True))
    op.add_column('backlink_entries', sa.Column('snippet_right', sa.Text(), nullable=True))
    op.add_column('backlink_entries', sa.Column('lost_reason', sa.String(100), nullable=True))
    op.add_column('backlink_entries', sa.Column('discovered_status', sa.String(50), nullable=True))
    op.add_column('backlink_entries', sa.Column('title', sa.Text(), nullable=True))


def downgrade() -> None:
    for col in ['title', 'discovered_status', 'lost_reason', 'snippet_right', 'snippet_left',
                'refdomains_source', 'traffic_domain', 'traffic', 'url_rating', 'http_code',
                'link_type', 'is_spam', 'is_content', 'is_sponsored', 'is_ugc', 'is_nofollow']:
        op.drop_column('backlink_entries', col)
