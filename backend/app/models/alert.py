from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, BigInteger, ForeignKey, func, ARRAY
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.db.base import Base


class MonitoredKeyword(Base):
    __tablename__ = "monitored_keywords"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    keyword_id = Column(Integer, ForeignKey("keywords.id", ondelete="CASCADE"), nullable=False, index=True)
    channels = Column(ARRAY(String), nullable=False, default=list)
    notify_exit_top10 = Column(Boolean, default=True)
    notify_enter_top10 = Column(Boolean, default=True)
    notify_enter_top3 = Column(Boolean, default=True)
    notify_rank1 = Column(Boolean, default=True)
    last_known_position = Column(Numeric(8, 2))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    keyword = relationship("Keyword")

class AlertRule(Base):
    __tablename__ = "alert_rules"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), index=True)
    name = Column(String(255), nullable=False)
    metric = Column(String(100), nullable=False)
    condition = Column(String(50), nullable=False)
    threshold = Column(Numeric(12, 4))
    window_minutes = Column(Integer, default=1440)
    channels = Column(ARRAY(String), nullable=False)
    is_active = Column(Boolean, default=True)
    cooldown_minutes = Column(Integer, default=240)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="alert_rules")
    website = relationship("Website", back_populates="alert_rules")
    events = relationship("AlertEvent", back_populates="rule", cascade="all, delete-orphan")


class AlertEvent(Base):
    __tablename__ = "alert_events"
    id = Column(BigInteger, primary_key=True)
    rule_id = Column(Integer, ForeignKey("alert_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id"), nullable=False, index=True)
    fired_at = Column(DateTime(timezone=True), nullable=False)
    metric_value = Column(Numeric(12, 4))
    context_json = Column(JSONB)
    channels_sent = Column(ARRAY(String))
    status = Column(String(20), default="sent")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    rule = relationship("AlertRule", back_populates="events")
