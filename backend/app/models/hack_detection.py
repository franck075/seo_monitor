from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, func
from app.db.base import Base


class HackDetection(Base):
    __tablename__ = "hack_detections"

    id = Column(Integer, primary_key=True, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(2000), nullable=False)
    detected_at = Column(DateTime(timezone=True), server_default=func.now())
    detection_type = Column(String(50), nullable=False)  # hidden_link | spam_keyword | injected_page
    severity = Column(String(20), nullable=False, default="high")
    detail = Column(Text)
    sample = Column(Text)
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True))
