"""Add trial_ends_at to users

Revision ID: 012
Revises: 011
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "trial_ends_at")
