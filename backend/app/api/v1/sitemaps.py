from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timezone, date as date_type
from pydantic import BaseModel
from app.db.session import get_db
from app.models.website import Website
from app.models.monitoring import SitemapSnapshot, SitemapURL
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User

router = APIRouter(prefix="/websites/{website_id}/sitemaps", tags=["sitemaps"])


class SitemapFetchPayload(BaseModel):
    sitemap_url: str


async def _verify_site(website_id: int, db: AsyncSession, owner_id: int):
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == owner_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    return site


async def _save_sitemap(db: AsyncSession, website_id: int, sitemap_url: str) -> dict:
    """Fetch, parse, diff and persist a sitemap snapshot. Returns the snapshot dict."""
    from app.services.sitemap_service import SitemapService
    svc = SitemapService()
    data = await svc.fetch_and_parse(sitemap_url)

    if data.get("error") and not data["urls"]:
        raise HTTPException(status_code=422, detail=f"Impossible de récupérer le sitemap : {data['error']}")

    prev_result = await db.execute(
        select(SitemapSnapshot)
        .where(SitemapSnapshot.website_id == website_id, SitemapSnapshot.sitemap_url == sitemap_url)
        .order_by(SitemapSnapshot.recorded_at.desc())
        .limit(1)
    )
    prev_snap = prev_result.scalar_one_or_none()

    old_urls: set = set()
    if prev_snap:
        prev_urls = await db.execute(select(SitemapURL.url).where(SitemapURL.snapshot_id == prev_snap.id))
        old_urls = {r[0] for r in prev_urls.all()}

    new_urls = {u["url"] for u in data["urls"]}
    diff = svc.diff_urls(old_urls, new_urls)

    now = datetime.now(timezone.utc)
    snap = SitemapSnapshot(
        website_id=website_id,
        sitemap_url=sitemap_url,
        recorded_at=now,
        url_count=data["url_count"],
        content_hash=data.get("content_hash"),
    )
    db.add(snap)
    await db.flush()

    for url_data in data["urls"]:
        url = url_data["url"]
        if url in diff["added"]:
            status = "added"
        elif url in diff["removed"]:
            status = "removed"
        else:
            status = "present"
        parsed_lastmod = None
        if url_data.get("lastmod"):
            try:
                parsed_lastmod = date_type.fromisoformat(str(url_data["lastmod"])[:10])
            except Exception:
                pass
        db.add(SitemapURL(
            snapshot_id=snap.id,
            website_id=website_id,
            url=url,
            lastmod=parsed_lastmod,
            changefreq=url_data.get("changefreq"),
            priority=url_data.get("priority"),
            status=status,
        ))

    await db.commit()
    await db.refresh(snap)
    return {
        "id": snap.id,
        "sitemap_url": snap.sitemap_url,
        "recorded_at": str(snap.recorded_at),
        "url_count": snap.url_count,
        "content_hash": snap.content_hash,
        "added": len(diff["added"]),
        "removed": len(diff["removed"]),
        "is_index": data.get("is_index", False),
        "child_count": data.get("child_count", 0),
    }


@router.get("")
async def get_sitemaps(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(SitemapSnapshot).where(SitemapSnapshot.website_id == website_id)
        .order_by(desc(SitemapSnapshot.recorded_at)).limit(50)
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "sitemap_url": r.sitemap_url,
            "recorded_at": str(r.recorded_at),
            "url_count": r.url_count,
            "content_hash": r.content_hash,
            "is_frozen": r.is_frozen,
        }
        for r in rows
    ]


@router.post("/fetch", status_code=201)
async def fetch_sitemap_manual(
    website_id: int,
    payload: SitemapFetchPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Fetch and parse a sitemap URL provided manually by the user."""
    await _verify_site(website_id, db, effective_owner_id)
    sitemap_url = payload.sitemap_url.strip()
    if not sitemap_url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL invalide — doit commencer par http:// ou https://")
    return await _save_sitemap(db, website_id, sitemap_url)


@router.post("/refresh", status_code=201)
async def refresh_sitemap_default(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Re-fetch the sitemap for this website using auto-discovery (robots.txt, common paths, GSC)."""
    site = await _verify_site(website_id, db, effective_owner_id)
    from app.core.url_utils import domain_to_url
    from app.tasks.sitemap_tasks import _discover_sitemap_url, _fetch_gsc_pages_as_sitemap
    base_url = domain_to_url(site.domain)
    sitemap_url = await _discover_sitemap_url(base_url, website=site, db=db)
    if sitemap_url.startswith("__gsc_pages__:"):
        gsc_property = sitemap_url[len("__gsc_pages__:"):]
        data = await _fetch_gsc_pages_as_sitemap(site, db, gsc_property)
        if data.get("error") and not data["urls"]:
            raise HTTPException(status_code=422, detail=f"Impossible de récupérer les pages GSC : {data['error']}")
        # Save directly using the same logic as _save_sitemap
        from app.services.sitemap_service import SitemapService
        svc = SitemapService()
        prev_result = await db.execute(
            select(SitemapSnapshot)
            .where(SitemapSnapshot.website_id == website_id, SitemapSnapshot.sitemap_url == sitemap_url)
            .order_by(SitemapSnapshot.recorded_at.desc())
            .limit(1)
        )
        prev_snap = prev_result.scalar_one_or_none()
        old_urls: set = set()
        if prev_snap:
            prev_urls = await db.execute(select(SitemapURL.url).where(SitemapURL.snapshot_id == prev_snap.id))
            old_urls = {r[0] for r in prev_urls.all()}
        new_urls = {u["url"] for u in data["urls"]}
        diff = svc.diff_urls(old_urls, new_urls)
        now = datetime.now(timezone.utc)
        snap = SitemapSnapshot(
            website_id=website_id,
            sitemap_url=sitemap_url,
            recorded_at=now,
            url_count=data["url_count"],
            content_hash=data.get("content_hash"),
        )
        db.add(snap)
        await db.flush()
        for url_data in data["urls"]:
            url = url_data["url"]
            status = "added" if url in diff["added"] else ("removed" if url in diff["removed"] else "present")
            db.add(SitemapURL(
                snapshot_id=snap.id,
                website_id=website_id,
                url=url,
                lastmod=None,
                changefreq=None,
                priority=None,
                status=status,
            ))
        await db.commit()
        await db.refresh(snap)
        return {
            "id": snap.id,
            "sitemap_url": snap.sitemap_url,
            "recorded_at": str(snap.recorded_at),
            "url_count": snap.url_count,
            "content_hash": snap.content_hash,
            "added": len(diff["added"]),
            "removed": len(diff["removed"]),
            "is_index": False,
            "child_count": 0,
            "source": "gsc_pages",
        }
    return await _save_sitemap(db, website_id, sitemap_url)


@router.get("/{snapshot_id}/urls")
async def get_sitemap_urls(
    website_id: int,
    snapshot_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    status: str = Query("all"),
):
    await _verify_site(website_id, db, effective_owner_id)
    q = select(SitemapURL).where(SitemapURL.snapshot_id == snapshot_id)
    if status != "all":
        q = q.where(SitemapURL.status == status)
    result = await db.execute(q.order_by(SitemapURL.url).limit(2000))
    rows = result.scalars().all()
    return [{"id": r.id, "url": r.url, "status": r.status, "lastmod": str(r.lastmod) if r.lastmod else None} for r in rows]
