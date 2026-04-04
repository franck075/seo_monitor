"""Support chat conversations and messages

Revision ID: 011
Revises: 010
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "support_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("is_resolved", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("unread_admin", sa.Integer(), server_default="0", nullable=False),
        sa.Column("unread_user", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "support_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("support_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_role", sa.String(10), nullable=False),  # 'user' | 'admin'
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_support_messages_conversation_id", "support_messages", ["conversation_id"])


def downgrade():
    op.drop_index("ix_support_messages_conversation_id", "support_messages")
    op.drop_table("support_messages")
    op.drop_table("support_conversations")
