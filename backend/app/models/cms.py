from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from app.db.base import Base


class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    type = Column(String(50), default="info", nullable=False)  # info, success, warning, offer
    image_url = Column(String(500), nullable=True)
    video_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class BlogPost(Base):
    __tablename__ = "blog_posts"
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    excerpt = Column(Text, nullable=True)
    content = Column(Text, nullable=False)  # HTML rich content
    cover_image = Column(String(500), nullable=True)
    meta_title = Column(String(255), nullable=True)
    meta_description = Column(String(500), nullable=True)
    canonical_url = Column(String(500), nullable=True)
    structured_data = Column(JSONB, nullable=True)  # JSON-LD as dict
    tags = Column(ARRAY(Text), nullable=True)
    author = Column(String(255), nullable=True)
    status = Column(String(20), default="draft", nullable=False)  # draft or published
    published_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SiteSetting(Base):
    __tablename__ = "site_settings"
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ClientLogo(Base):
    __tablename__ = "client_logos"
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(255), nullable=False)
    logo_url = Column(String(500), nullable=False)
    website_url = Column(String(500), nullable=True)
    position = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
