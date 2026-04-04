"""Add monitored_pages table

Revision ID: 003
Revises: 002
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'monitored_pages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(2000), nullable=False),
        sa.Column('label', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'url', name='uq_site_page_url'),
    )
    op.create_index('ix_monitored_pages_id', 'monitored_pages', ['id'])
    op.create_index('ix_monitored_pages_website_id', 'monitored_pages', ['website_id'])


def downgrade() -> None:
    op.drop_table('monitored_pages')
