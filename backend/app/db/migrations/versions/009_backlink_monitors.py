"""Backlink monitors + suspicious flag on backlink_entries

Revision ID: 009
Revises: 008
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # backlink_monitors - what to watch and alert thresholds
    op.create_table(
        'backlink_monitors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('target', sa.String(length=2000), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('notify_new', sa.Boolean(), server_default='false'),
        sa.Column('notify_suspicious', sa.Boolean(), server_default='true'),
        sa.Column('dr_threshold', sa.SmallInteger(), server_default='10'),
        sa.Column('channels', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('last_checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'target', name='uq_backlink_monitor_target'),
    )
    op.create_index('ix_backlink_monitors_website_id', 'backlink_monitors', ['website_id'])
    op.create_index('ix_backlink_monitors_user_id', 'backlink_monitors', ['user_id'])

    # Extend backlink_entries with suspicion tracking
    op.add_column('backlink_entries', sa.Column('is_suspicious', sa.Boolean(), server_default='false'))
    op.add_column('backlink_entries', sa.Column('suspicious_reason', sa.String(length=200), nullable=True))
    op.add_column('backlink_entries', sa.Column('alerted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('backlink_entries', sa.Column('is_dismissed', sa.Boolean(), server_default='false'))


def downgrade() -> None:
    op.drop_column('backlink_entries', 'is_dismissed')
    op.drop_column('backlink_entries', 'alerted_at')
    op.drop_column('backlink_entries', 'suspicious_reason')
    op.drop_column('backlink_entries', 'is_suspicious')
    op.drop_index('ix_backlink_monitors_user_id', table_name='backlink_monitors')
    op.drop_index('ix_backlink_monitors_website_id', table_name='backlink_monitors')
    op.drop_table('backlink_monitors')
