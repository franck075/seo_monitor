"""014 hack detections

Revision ID: 014_hack_detections
"""
from alembic import op
import sqlalchemy as sa

revision = '014_hack_detections'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'hack_detections',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('website_id', sa.Integer(), sa.ForeignKey('websites.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('url', sa.String(2000), nullable=False),
        sa.Column('detected_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('detection_type', sa.String(50), nullable=False),  # 'hidden_link' | 'spam_keyword' | 'injected_page'
        sa.Column('severity', sa.String(20), nullable=False, server_default='high'),  # 'high' | 'medium'
        sa.Column('detail', sa.Text()),
        sa.Column('sample', sa.Text()),  # extrait du contenu suspect
        sa.Column('is_resolved', sa.Boolean(), server_default='false'),
        sa.Column('resolved_at', sa.DateTime(timezone=True)),
    )
    op.create_index('ix_hack_detections_website_id', 'hack_detections', ['website_id'])
    op.create_index('ix_hack_detections_detected_at', 'hack_detections', ['detected_at'])


def downgrade():
    op.drop_table('hack_detections')
