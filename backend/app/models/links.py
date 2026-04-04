from sqlalchemy import Column, Integer, SmallInteger, String, Boolean, DateTime, Numeric, Text, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from app.db.base import Base


class LinkReport(Base):
    __tablename__ = "link_reports"
    id = Column(Integer, primary_key=True, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    total_backlinks = Column(Integer, default=0)
    dofollow_backlinks = Column(Integer, default=0)
    nofollow_backlinks = Column(Integer, default=0)
    total_referring_domains = Column(Integer, default=0)
    dofollow_domains = Column(Integer, default=0)


class BacklinkEntry(Base):
    __tablename__ = "backlink_entries"
    id = Column(Integer, primary_key=True, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    url_from = Column(Text, nullable=False)
    domain_from = Column(String(255), nullable=False)
    url_to = Column(Text)
    anchor_text = Column(String(500))
    title = Column(Text)
    is_dofollow = Column(Boolean, default=True)
    is_nofollow = Column(Boolean, default=False)
    is_ugc = Column(Boolean, default=False)
    is_sponsored = Column(Boolean, default=False)
    is_content = Column(Boolean, default=False)
    is_spam = Column(Boolean, default=False)
    link_type = Column(String(50))
    http_code = Column(SmallInteger)
    domain_rating = Column(Numeric(5, 2))
    url_rating = Column(Numeric(5, 2))
    traffic = Column(Integer)
    traffic_domain = Column(Integer)
    refdomains_source = Column(Integer)
    snippet_left = Column(Text)
    snippet_right = Column(Text)
    lost_reason = Column(String(100))
    discovered_status = Column(String(50))
    first_seen_at = Column(DateTime(timezone=True))
    last_seen_at = Column(DateTime(timezone=True))
    is_new = Column(Boolean, default=False)
    is_lost = Column(Boolean, default=False)
    is_suspicious = Column(Boolean, default=False)
    suspicious_reason = Column(String(200))
    alerted_at = Column(DateTime(timezone=True))
    is_dismissed = Column(Boolean, default=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "url_from", "url_to", name="uq_backlink_entry"),)


class ReferringDomainEntry(Base):
    __tablename__ = "referring_domain_entries"
    id = Column(Integer, primary_key=True, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    domain = Column(String(255), nullable=False)
    backlinks_count = Column(Integer, default=1)
    is_dofollow = Column(Boolean, default=True)
    domain_rating = Column(Numeric(5, 2))
    first_seen_at = Column(DateTime(timezone=True))
    last_seen_at = Column(DateTime(timezone=True))
    is_new = Column(Boolean, default=False)
    is_lost = Column(Boolean, default=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "domain", name="uq_referring_domain"),)


class AnchorTextEntry(Base):
    __tablename__ = "anchor_text_entries"
    id = Column(Integer, primary_key=True, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    anchor = Column(String(500), nullable=False)
    backlinks_count = Column(Integer, default=0)
    referring_domains_count = Column(Integer, default=0)
    dofollow_count = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "anchor", name="uq_anchor_text"),)


class BacklinkMonitor(Base):
    __tablename__ = "backlink_monitors"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    target = Column(String(2000), nullable=False)   # URL or domain
    label = Column(String(255))
    is_active = Column(Boolean, default=True)
    notify_new = Column(Boolean, default=False)       # alert on any new backlink
    notify_suspicious = Column(Boolean, default=True) # alert on suspicious
    dr_threshold = Column(SmallInteger, default=10)   # DR below this = suspicious
    channels = Column(ARRAY(String), nullable=False, default=list)
    last_checked_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "target", name="uq_backlink_monitor_target"),)
