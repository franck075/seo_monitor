"""Add alert_email to users

Revision ID: 013
Revises: 012
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("alert_email", sa.String(255), nullable=True))


def downgrade():
    op.drop_column("users", "alert_email")
