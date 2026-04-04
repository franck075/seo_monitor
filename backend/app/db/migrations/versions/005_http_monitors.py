"""HTTP Monitors table

Revision ID: 005
Revises: 004
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'http_monitors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(length=2000), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('check_frequency', sa.String(length=20), nullable=True, server_default='daily'),
        sa.Column('notify_on_error', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('notify_on_redirect', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('notify_on_slow', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('slow_threshold_ms', sa.Integer(), nullable=True, server_default='3000'),
        sa.Column('channels', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('last_status_code', sa.SmallInteger(), nullable=True),
        sa.Column('last_response_time', sa.Numeric(8, 2), nullable=True),
        sa.Column('last_checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'url', name='uq_http_monitor_site_url'),
    )
    op.create_index('ix_http_monitors_id', 'http_monitors', ['id'])
    op.create_index('ix_http_monitors_user_id', 'http_monitors', ['user_id'])
    op.create_index('ix_http_monitors_website_id', 'http_monitors', ['website_id'])


def downgrade() -> None:
    op.drop_index('ix_http_monitors_website_id', table_name='http_monitors')
    op.drop_index('ix_http_monitors_user_id', table_name='http_monitors')
    op.drop_index('ix_http_monitors_id', table_name='http_monitors')
    op.drop_table('http_monitors')
