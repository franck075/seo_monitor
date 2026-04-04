from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.base import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(String(20), default="user")
    is_active = Column(Boolean, default=True)
    plan = Column(String(20), default="starter", nullable=False)
    plan_expires_at = Column(DateTime(timezone=True), nullable=True)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    alert_email = Column(String(255), nullable=True)
    telegram_chat_id = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    websites = relationship("Website", back_populates="user", cascade="all, delete-orphan")
    api_credentials = relationship("UserAPICredential", back_populates="user", cascade="all, delete-orphan")
    alert_rules = relationship("AlertRule", back_populates="user", cascade="all, delete-orphan")


class UserAPICredential(Base):
    __tablename__ = "user_api_credentials"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(50), nullable=False)
    label = Column(String(255))
    credentials_enc = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="api_credentials")
