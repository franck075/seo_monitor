from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Numeric, BigInteger, SmallInteger, Text, ForeignKey, func, UniqueConstraint, ARRAY
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base


class MonitoredPage(Base):
    __tablename__ = "monitored_pages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(2000), nullable=False)
    label = Column(String(255))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "url", name="uq_site_page_url"),)

class TrafficSnapshot(Base):
    __tablename__ = "traffic_snapshots"
    id = Column(BigInteger, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_date = Column(Date, nullable=False)
    sessions = Column(Integer, default=0)
    users = Column(Integer, default=0)
    new_users = Column(Integer, default=0)
    pageviews = Column(Integer, default=0)
    bounce_rate = Column(Numeric(6, 4))
    avg_session_duration = Column(Numeric(10, 2))
    source = Column(String(50), default="organic")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "recorded_date", "source"),)


class GSCPerformanceSnapshot(Base):
    __tablename__ = "gsc_performance_snapshots"
    id = Column(BigInteger, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_date = Column(Date, nullable=False)
    total_clicks = Column(Integer, default=0)
    total_impressions = Column(Integer, default=0)
    avg_ctr = Column(Numeric(6, 4))
    avg_position = Column(Numeric(6, 2))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "recorded_date"),)


class CoreWebVital(Base):
    __tablename__ = "core_web_vitals"
    id = Column(BigInteger, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    page_url = Column(String(2000), nullable=False)
    strategy = Column(String(10), default="mobile")
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    lcp = Column(Numeric(8, 2))
    cls = Column(Numeric(8, 4))
    inp = Column(Numeric(8, 2))
    ttfb = Column(Numeric(8, 2))
    fcp = Column(Numeric(8, 2))
    performance_score = Column(SmallInteger)
    lcp_rating = Column(String(20))
    cls_rating = Column(String(20))
    inp_rating = Column(String(20))
    ttfb_rating = Column(String(20))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SEOMonitor(Base):
    __tablename__ = "seo_monitors"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(2000), nullable=False)
    label = Column(String(255))
    is_active = Column(Boolean, default=True)
    check_frequency = Column(String(20), default="daily")
    track_title = Column(Boolean, default=True)
    track_meta_desc = Column(Boolean, default=True)
    track_h1 = Column(Boolean, default=True)
    track_h2 = Column(Boolean, default=False)
    track_h3 = Column(Boolean, default=False)
    track_canonical = Column(Boolean, default=True)
    track_robots = Column(Boolean, default=True)
    track_og = Column(Boolean, default=False)
    track_schema = Column(Boolean, default=True)
    track_hreflang = Column(Boolean, default=False)
    track_links_count = Column(Boolean, default=False)
    track_alt_text = Column(Boolean, default=False)
    track_full_html = Column(Boolean, default=False)
    channels = Column(ARRAY(String), nullable=False, default=list)
    last_checked_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "url", name="uq_seo_monitor_site_url"),)


class SEOSnapshot(Base):
    __tablename__ = "seo_snapshots"
    id = Column(BigInteger, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    page_url = Column(String(2000), nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    title = Column(Text)
    meta_description = Column(Text)
    h1 = Column(Text)
    h2s = Column(ARRAY(Text))
    h3s = Column(ARRAY(Text))
    canonical = Column(String(2000))
    robots_meta = Column(String(255))
    schema_types = Column(ARRAY(Text))
    og_title = Column(Text)
    og_description = Column(Text)
    hreflang = Column(ARRAY(Text))
    links_count = Column(Integer)
    images_without_alt = Column(Integer)
    content_hash = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SEOChange(Base):
    __tablename__ = "seo_changes"
    id = Column(BigInteger, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    page_url = Column(String(2000), nullable=False)
    detected_at = Column(DateTime(timezone=True), nullable=False)
    field = Column(String(100), nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)
    snapshot_before = Column(BigInteger, ForeignKey("seo_snapshots.id"))
    snapshot_after = Column(BigInteger, ForeignKey("seo_snapshots.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class HTTPMonitor(Base):
    __tablename__ = "http_monitors"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(2000), nullable=False)
    label = Column(String(255))
    is_active = Column(Boolean, default=True)
    check_frequency = Column(String(20), default="daily")
    notify_on_error = Column(Boolean, default=True)
    notify_on_redirect = Column(Boolean, default=False)
    notify_on_slow = Column(Boolean, default=False)
    slow_threshold_ms = Column(Integer, default=3000)
    channels = Column(ARRAY(String), nullable=False, default=list)
    last_status_code = Column(SmallInteger)
    last_response_time = Column(Numeric(8, 2))
    last_checked_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "url", name="uq_http_monitor_site_url"),)


class HTTPCheck(Base):
    __tablename__ = "http_checks"
    id = Column(BigInteger, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    page_url = Column(String(2000), nullable=False)
    checked_at = Column(DateTime(timezone=True), nullable=False)
    status_code = Column(SmallInteger)
    redirect_url = Column(String(2000))
    redirect_chain = Column(JSONB)
    response_time = Column(Numeric(8, 2))
    is_error = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RobotsSnapshot(Base):
    __tablename__ = "robots_snapshots"
    id = Column(BigInteger, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    content = Column(Text)
    content_hash = Column(String(64))
    fetch_status = Column(SmallInteger)
    has_changed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SitemapSnapshot(Base):
    __tablename__ = "sitemap_snapshots"
    id = Column(BigInteger, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    sitemap_url = Column(String(2000), nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    url_count = Column(Integer, default=0)
    content_hash = Column(String(64))
    last_modified = Column(DateTime(timezone=True))
    is_frozen = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SitemapURL(Base):
    __tablename__ = "sitemap_urls"
    id = Column(BigInteger, primary_key=True)
    snapshot_id = Column(BigInteger, ForeignKey("sitemap_snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id"), nullable=False)
    url = Column(String(2000), nullable=False)
    lastmod = Column(Date)
    changefreq = Column(String(50))
    priority = Column(Numeric(3, 2))
    status = Column(String(20), default="present")


class IndexationMonitor(Base):
    __tablename__ = "indexation_monitors"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(2000), nullable=False)
    label = Column(String(255))
    is_active = Column(Boolean, default=True)
    last_coverage_state = Column(String(100))
    last_indexing_state = Column(String(100))
    last_robots_state = Column(String(100))
    last_crawl_time = Column(DateTime(timezone=True))
    last_checked_at = Column(DateTime(timezone=True))
    notify_not_indexed = Column(Boolean, default=True)
    notify_blocked = Column(Boolean, default=True)
    notify_recovered = Column(Boolean, default=True)
    channels = Column(ARRAY(String), nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("website_id", "url", name="uq_indexation_monitor_url"),)


class IndexationError(Base):
    __tablename__ = "indexation_errors"
    id = Column(BigInteger, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    page_url = Column(String(2000), nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    error_type = Column(String(100))
    coverage_state = Column(String(100))
    indexing_state = Column(String(100))
    robots_state = Column(String(100))
    last_crawled = Column(DateTime(timezone=True))
    is_indexable = Column(Boolean)
    google_canonical = Column(String(2000))
    user_canonical = Column(String(2000))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
