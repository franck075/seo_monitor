"""Link reports - backlinks, referring domains, anchor texts (Ahrefs)

Revision ID: 007
Revises: 006
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add Ahrefs API key (encrypted) to websites
    op.add_column('websites', sa.Column('ahrefs_api_key_enc', sa.Text(), nullable=True))

    # link_reports - daily aggregate snapshot
    op.create_table(
        'link_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('total_backlinks', sa.Integer(), server_default='0'),
        sa.Column('dofollow_backlinks', sa.Integer(), server_default='0'),
        sa.Column('nofollow_backlinks', sa.Integer(), server_default='0'),
        sa.Column('total_referring_domains', sa.Integer(), server_default='0'),
        sa.Column('dofollow_domains', sa.Integer(), server_default='0'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_link_reports_website_id', 'link_reports', ['website_id'])

    # backlink_entries - living snapshot of top 1000 backlinks
    op.create_table(
        'backlink_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('url_from', sa.Text(), nullable=False),
        sa.Column('domain_from', sa.String(length=255), nullable=False),
        sa.Column('url_to', sa.Text(), nullable=True),
        sa.Column('anchor_text', sa.String(length=500), nullable=True),
        sa.Column('is_dofollow', sa.Boolean(), server_default='true'),
        sa.Column('domain_rating', sa.Numeric(5, 2), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_new', sa.Boolean(), server_default='false'),
        sa.Column('is_lost', sa.Boolean(), server_default='false'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'url_from', 'url_to', name='uq_backlink_entry'),
    )
    op.create_index('ix_backlink_entries_website_id', 'backlink_entries', ['website_id'])

    # referring_domain_entries - living snapshot of top referring domains
    op.create_table(
        'referring_domain_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('domain', sa.String(length=255), nullable=False),
        sa.Column('backlinks_count', sa.Integer(), server_default='1'),
        sa.Column('is_dofollow', sa.Boolean(), server_default='true'),
        sa.Column('domain_rating', sa.Numeric(5, 2), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_new', sa.Boolean(), server_default='false'),
        sa.Column('is_lost', sa.Boolean(), server_default='false'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'domain', name='uq_referring_domain'),
    )
    op.create_index('ix_referring_domain_entries_website_id', 'referring_domain_entries', ['website_id'])

    # anchor_text_entries - top anchor texts (replaced on each refresh)
    op.create_table(
        'anchor_text_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('anchor', sa.String(length=500), nullable=False),
        sa.Column('backlinks_count', sa.Integer(), server_default='0'),
        sa.Column('referring_domains_count', sa.Integer(), server_default='0'),
        sa.Column('dofollow_count', sa.Integer(), server_default='0'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'anchor', name='uq_anchor_text'),
    )
    op.create_index('ix_anchor_text_entries_website_id', 'anchor_text_entries', ['website_id'])


def downgrade() -> None:
    op.drop_table('anchor_text_entries')
    op.drop_table('referring_domain_entries')
    op.drop_table('backlink_entries')
    op.drop_table('link_reports')
    op.drop_column('websites', 'ahrefs_api_key_enc')
