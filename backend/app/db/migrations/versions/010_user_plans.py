"""Add plan and subscription fields to users

Revision ID: 010
Revises: 009
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None

PLANS = ("starter", "pro", "agency")

def upgrade():
    op.add_column("users", sa.Column("plan", sa.String(20), nullable=False, server_default="starter"))
    op.add_column("users", sa.Column("plan_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("notes", sa.Text(), nullable=True))

def downgrade():
    op.drop_column("users", "notes")
    op.drop_column("users", "plan_expires_at")
    op.drop_column("users", "plan")
