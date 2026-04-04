from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.base import Base


class SupportConversation(Base):
    __tablename__ = "support_conversations"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    is_resolved = Column(Boolean, default=False, nullable=False)
    unread_admin = Column(Integer, default=0, nullable=False)
    unread_user = Column(Integer, default=0, nullable=False)
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    messages = relationship("SupportMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="SupportMessage.created_at")


class SupportMessage(Base):
    __tablename__ = "support_messages"
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("support_conversations.id", ondelete="CASCADE"), nullable=False)
    sender_role = Column(String(10), nullable=False)  # 'user' | 'admin'
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("SupportConversation", back_populates="messages")
