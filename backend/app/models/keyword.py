from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Numeric, BigInteger, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from app.db.base import Base

class Keyword(Base):
    __tablename__ = "keywords"
    id = Column(Integer, primary_key=True, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    query = Column(String(500), nullable=False)
    page = Column(String(2000))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "query"),)

    website = relationship("Website", back_populates="keywords")
    positions = relationship("KeywordPosition", back_populates="keyword", cascade="all, delete-orphan")


class KeywordPosition(Base):
    __tablename__ = "keyword_positions"
    id = Column(BigInteger, primary_key=True, index=True)
    keyword_id = Column(Integer, ForeignKey("keywords.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_date = Column(Date, nullable=False)
    position = Column(Numeric(6, 2))
    clicks = Column(Integer, default=0)
    impressions = Column(Integer, default=0)
    ctr = Column(Numeric(6, 4))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("keyword_id", "recorded_date"),)

    keyword = relationship("Keyword", back_populates="positions")


class KeywordCluster(Base):
    __tablename__ = "keyword_clusters"
    id = Column(Integer, primary_key=True, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    color = Column(String(20), nullable=False, default="#3b82f6")
    terms = Column(ARRAY(String), nullable=False, default=list)
    is_brand = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
