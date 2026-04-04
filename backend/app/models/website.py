from sqlalchemy import Column, Integer, String, Boolean, DateTime, SmallInteger, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.base import Base

class Website(Base):
    __tablename__ = "websites"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    domain = Column(String(255), nullable=False)
    display_name = Column(String(255))
    gsc_property = Column(String(500))
    ga4_property_id = Column(String(100))
    gsc_cred_id = Column(Integer, ForeignKey("user_api_credentials.id"))
    ga4_cred_id = Column(Integer, ForeignKey("user_api_credentials.id"))
    timezone = Column(String(100), default="UTC")
    is_active = Column(Boolean, default=True)
    health_score = Column(SmallInteger, default=100)
    ahrefs_api_key_enc = Column(String(1000))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="websites")
    keywords = relationship("Keyword", back_populates="website", cascade="all, delete-orphan")
    alert_rules = relationship("AlertRule", back_populates="website", cascade="all, delete-orphan")
