"""Indexation monitors table + extend indexation_errors

Revision ID: 006
Revises: 005
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'indexation_monitors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(length=2000), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('last_coverage_state', sa.String(length=100), nullable=True),
        sa.Column('last_indexing_state', sa.String(length=100), nullable=True),
        sa.Column('last_robots_state', sa.String(length=100), nullable=True),
        sa.Column('last_crawl_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notify_not_indexed', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('notify_blocked', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('notify_recovered', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('channels', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'url', name='uq_indexation_monitor_url'),
    )
    op.create_index('ix_indexation_monitors_id', 'indexation_monitors', ['id'])
    op.create_index('ix_indexation_monitors_user_id', 'indexation_monitors', ['user_id'])
    op.create_index('ix_indexation_monitors_website_id', 'indexation_monitors', ['website_id'])

    # Extend indexation_errors with new columns
    op.add_column('indexation_errors', sa.Column('indexing_state', sa.String(length=100), nullable=True))
    op.add_column('indexation_errors', sa.Column('robots_state', sa.String(length=100), nullable=True))
    op.add_column('indexation_errors', sa.Column('google_canonical', sa.String(length=2000), nullable=True))
    op.add_column('indexation_errors', sa.Column('user_canonical', sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column('indexation_errors', 'user_canonical')
    op.drop_column('indexation_errors', 'google_canonical')
    op.drop_column('indexation_errors', 'robots_state')
    op.drop_column('indexation_errors', 'indexing_state')
    op.drop_index('ix_indexation_monitors_website_id', table_name='indexation_monitors')
    op.drop_index('ix_indexation_monitors_user_id', table_name='indexation_monitors')
    op.drop_index('ix_indexation_monitors_id', table_name='indexation_monitors')
    op.drop_table('indexation_monitors')
