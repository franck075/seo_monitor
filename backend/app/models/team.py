from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app.db.base import Base


class TeamInvitation(Base):
    __tablename__ = "team_invitations"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False)
    role = Column(String(20), default="editor")  # "editor" or "viewer"
    token = Column(String(64), unique=True, nullable=False, index=True)
    status = Column(String(20), default="pending")  # "pending", "accepted", "cancelled"
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", foreign_keys=[owner_id])


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), default="editor")  # "editor" or "viewer"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", foreign_keys=[owner_id])
    member = relationship("User", foreign_keys=[member_id])

    __table_args__ = (UniqueConstraint("owner_id", "member_id", name="uq_team_member"),)
