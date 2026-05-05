import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from app.db.session import get_db
from app.models.cms import Announcement, BlogPost, ClientLogo, SiteSetting

public_router = APIRouter(tags=["public"])


# ── Public Announcements ──────────────────────────────────────────────────────

@public_router.get("/announcements/active")
async def active_announcements(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    result = await db.execute(select(Announcement).where(Announcement.is_active == True))
    rows = result.scalars().all()
    active = []
    for ann in rows:
        # No dates = always active
        if ann.starts_at is None and ann.ends_at is None:
            active.append(ann)
            continue
        starts_ok = ann.starts_at is None or ann.starts_at <= now
        ends_ok = ann.ends_at is None or ann.ends_at >= now
        if starts_ok and ends_ok:
            active.append(ann)
    return [
        {
            "id": a.id, "title": a.title, "content": a.content, "type": a.type,
            "image_url": a.image_url, "video_url": a.video_url,
            "starts_at": a.starts_at, "ends_at": a.ends_at,
        }
        for a in active
    ]


# ── Public Blog ───────────────────────────────────────────────────────────────

@public_router.get("/blog")
async def list_published_posts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BlogPost)
        .where(BlogPost.status == "published")
        .order_by(BlogPost.published_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "slug": r.slug, "title": r.title, "excerpt": r.excerpt,
            "cover_image": r.cover_image, "published_at": r.published_at,
            "tags": r.tags, "author": r.author,
        }
        for r in rows
    ]


@public_router.get("/blog/{slug}")
async def get_published_post(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.status == "published")
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    return {
        "id": post.id, "slug": post.slug, "title": post.title, "excerpt": post.excerpt,
        "content": post.content, "cover_image": post.cover_image, "meta_title": post.meta_title,
        "meta_description": post.meta_description, "canonical_url": post.canonical_url,
        "structured_data": post.structured_data, "tags": post.tags, "author": post.author,
        "published_at": post.published_at,
    }


# ── Public SEO Settings ──────────────────────────────────────────────────────

@public_router.get("/seo-settings")
async def public_seo_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SiteSetting).where(SiteSetting.key == "seo"))
    setting = result.scalar_one_or_none()
    if not setting or not setting.value:
        return {"meta_title": "", "meta_description": "", "structured_data": None}
    try:
        data = json.loads(setting.value)
        structured = None
        if data.get("structured_data"):
            try:
                structured = json.loads(data["structured_data"])
            except (json.JSONDecodeError, TypeError):
                pass
        return {
            "meta_title": data.get("meta_title", ""),
            "meta_description": data.get("meta_description", ""),
            "structured_data": structured,
        }
    except json.JSONDecodeError:
        return {"meta_title": "", "meta_description": "", "structured_data": None}


# ── Public Site Scripts ──────────────────────────────────────────────────────

@public_router.get("/site-scripts")
async def public_site_scripts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SiteSetting).where(SiteSetting.key == "scripts"))
    setting = result.scalar_one_or_none()
    empty = {"head_priority": "", "head": "", "body": "", "head_legacy": "", "body_legacy": ""}
    if not setting or not setting.value:
        return empty
    try:
        return {**empty, **json.loads(setting.value)}
    except json.JSONDecodeError:
        return empty


# ── Public Client Logos ───────────────────────────────────────────────────────

@public_router.get("/client-logos/active")
async def active_client_logos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ClientLogo)
        .where(ClientLogo.is_active == True)
        .order_by(ClientLogo.position.asc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id, "name": r.name, "logo_url": r.logo_url,
            "website_url": r.website_url, "position": r.position,
        }
        for r in rows
    ]
