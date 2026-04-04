"""Add monitored_keywords table

Revision ID: 002
Revises: 001
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'monitored_keywords',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('keyword_id', sa.Integer(), nullable=False),
        sa.Column('channels', postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column('notify_exit_top10', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('notify_enter_top10', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('notify_enter_top3', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('notify_rank1', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('last_known_position', sa.Numeric(8, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['keyword_id'], ['keywords.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'keyword_id', name='uq_user_keyword_monitor'),
    )
    op.create_index('ix_monitored_keywords_website_id', 'monitored_keywords', ['website_id'])
    op.create_index('ix_monitored_keywords_keyword_id', 'monitored_keywords', ['keyword_id'])


def downgrade() -> None:
    op.drop_table('monitored_keywords')
