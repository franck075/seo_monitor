"""017 team management: team_invitations, team_members

Revision ID: 017_team
Revises: 016_cms
"""
from alembic import op
import sqlalchemy as sa

revision = "017_team"
down_revision = "016_cms"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "team_invitations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="editor"),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_team_invitations_token", "team_invitations", ["token"], unique=True)
    op.create_index("ix_team_invitations_owner_id", "team_invitations", ["owner_id"])

    op.create_table(
        "team_members",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="editor"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("owner_id", "member_id", name="uq_team_member"),
    )
    op.create_index("ix_team_members_owner_id", "team_members", ["owner_id"])
    op.create_index("ix_team_members_member_id", "team_members", ["member_id"])


def downgrade():
    op.drop_table("team_members")
    op.drop_table("team_invitations")
