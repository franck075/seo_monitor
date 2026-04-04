from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from app.db.base import Base


class SEOIssue(Base):
    """Problème SEO détecté — unifie les 12 types de monitoring avancé."""
    __tablename__ = "seo_issues"

    id = Column(Integer, primary_key=True, index=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False, index=True)
    issue_type = Column(String(50), nullable=False, index=True)
    # cannibalization | position_drop | redirect_chain | aging_content | no_impressions
    # canonical_change | robots_change | x_robots_noindex | redirect_broken | h1_change
    # duplicate_title | duplicate_meta
    severity = Column(String(20), nullable=False, default="medium")  # high | medium | low
    url = Column(String(2000))  # page affectée (nullable pour les problèmes globaux)
    detail = Column(Text)  # description lisible
    data = Column(JSONB)  # données structurées (query, pages, valeurs, etc.)
    detected_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True))


class SEOIssueAlertConfig(Base):
    """Configuration des alertes par type de problème pour chaque site."""
    __tablename__ = "seo_issue_alert_configs"

    id = Column(Integer, primary_key=True)
    website_id = Column(Integer, ForeignKey("websites.id", ondelete="CASCADE"), nullable=False)
    issue_type = Column(String(50), nullable=False)
    enabled = Column(Boolean, default=True)
    frequency = Column(String(20), default="weekly")  # daily | weekly | monthly
    threshold = Column(Integer)  # position_drop: N positions / no_impressions: X jours / position_drop min: N
    channels = Column(ARRAY(String), default=[])
    last_notified_at = Column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("website_id", "issue_type"),)
