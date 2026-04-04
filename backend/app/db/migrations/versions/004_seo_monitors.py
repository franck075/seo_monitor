"""SEO Monitors table + extend seo_snapshots

Revision ID: 004
Revises: 003
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'seo_monitors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(length=2000), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('check_frequency', sa.String(length=20), nullable=True, server_default='daily'),
        sa.Column('track_title', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('track_meta_desc', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('track_h1', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('track_h2', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('track_h3', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('track_canonical', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('track_robots', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('track_og', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('track_schema', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('track_hreflang', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('track_links_count', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('track_alt_text', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('track_full_html', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('last_checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'url', name='uq_seo_monitor_site_url'),
    )
    op.create_index('ix_seo_monitors_id', 'seo_monitors', ['id'])
    op.create_index('ix_seo_monitors_user_id', 'seo_monitors', ['user_id'])
    op.create_index('ix_seo_monitors_website_id', 'seo_monitors', ['website_id'])

    # Extend seo_snapshots with new columns
    op.add_column('seo_snapshots', sa.Column('h3s', postgresql.ARRAY(sa.Text()), nullable=True))
    op.add_column('seo_snapshots', sa.Column('hreflang', postgresql.ARRAY(sa.Text()), nullable=True))
    op.add_column('seo_snapshots', sa.Column('links_count', sa.Integer(), nullable=True))
    op.add_column('seo_snapshots', sa.Column('images_without_alt', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('seo_snapshots', 'images_without_alt')
    op.drop_column('seo_snapshots', 'links_count')
    op.drop_column('seo_snapshots', 'hreflang')
    op.drop_column('seo_snapshots', 'h3s')
    op.drop_index('ix_seo_monitors_website_id', table_name='seo_monitors')
    op.drop_index('ix_seo_monitors_user_id', table_name='seo_monitors')
    op.drop_index('ix_seo_monitors_id', table_name='seo_monitors')
    op.drop_table('seo_monitors')
