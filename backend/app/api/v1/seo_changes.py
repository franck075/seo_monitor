from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from typing import Optional, List
from app.db.session import get_db
from app.models.website import Website
from app.models.monitoring import SEOChange, SEOSnapshot, SEOMonitor
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from pydantic import BaseModel
from datetime import datetime, timezone

router = APIRouter(prefix="/websites/{website_id}/seo-changes", tags=["seo-changes"])


async def _verify_site(website_id: int, db: AsyncSession, owner_id: int) -> Website:
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == owner_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    return site


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class MonitorCreate(BaseModel):
    urls: List[str]
    label: Optional[str] = None
    check_frequency: str = "daily"
    track_title: bool = True
    track_meta_desc: bool = True
    track_h1: bool = True
    track_h2: bool = False
    track_h3: bool = False
    track_canonical: bool = True
    track_robots: bool = True
    track_og: bool = False
    track_schema: bool = True
    track_hreflang: bool = False
    track_links_count: bool = False
    track_alt_text: bool = False
    track_full_html: bool = False
    channels: List[str] = []


class MonitorUpdate(BaseModel):
    label: Optional[str] = None
    is_active: Optional[bool] = None
    check_frequency: Optional[str] = None
    track_title: Optional[bool] = None
    track_meta_desc: Optional[bool] = None
    track_h1: Optional[bool] = None
    track_h2: Optional[bool] = None
    track_h3: Optional[bool] = None
    track_canonical: Optional[bool] = None
    track_robots: Optional[bool] = None
    track_og: Optional[bool] = None
    track_schema: Optional[bool] = None
    track_hreflang: Optional[bool] = None
    track_links_count: Optional[bool] = None
    track_alt_text: Optional[bool] = None
    track_full_html: Optional[bool] = None
    channels: Optional[List[str]] = None


# ── Monitor CRUD ──────────────────────────────────────────────────────────────

def _monitor_out(m: SEOMonitor) -> dict:
    return {
        "id": m.id,
        "url": m.url,
        "label": m.label or m.url.replace("https://", "").replace("http://", ""),
        "is_active": m.is_active,
        "check_frequency": m.check_frequency,
        "last_checked_at": str(m.last_checked_at) if m.last_checked_at else None,
        "created_at": str(m.created_at),
        "channels": m.channels or [],
        "track_title": m.track_title,
        "track_meta_desc": m.track_meta_desc,
        "track_h1": m.track_h1,
        "track_h2": m.track_h2,
        "track_h3": m.track_h3,
        "track_canonical": m.track_canonical,
        "track_robots": m.track_robots,
        "track_og": m.track_og,
        "track_schema": m.track_schema,
        "track_hreflang": m.track_hreflang,
        "track_links_count": m.track_links_count,
        "track_alt_text": m.track_alt_text,
        "track_full_html": m.track_full_html,
    }


@router.get("/monitors")
async def list_monitors(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(SEOMonitor)
        .where(SEOMonitor.website_id == website_id, SEOMonitor.user_id == effective_owner_id)
        .order_by(SEOMonitor.created_at)
    )
    monitors = result.scalars().all()

    out = []
    for m in monitors:
        d = _monitor_out(m)
        # Count changes for this monitor URL
        count_result = await db.execute(
            select(func.count()).where(SEOChange.website_id == website_id, SEOChange.page_url == m.url)
        )
        d["changes_count"] = count_result.scalar() or 0
        out.append(d)
    return out


@router.post("/monitors", status_code=201)
async def create_monitors(
    website_id: int,
    payload: MonitorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    created = []
    for raw_url in payload.urls:
        url = raw_url.strip().rstrip("/")
        if not url.startswith("http"):
            continue
        existing = await db.execute(
            select(SEOMonitor).where(SEOMonitor.website_id == website_id, SEOMonitor.url == url)
        )
        if existing.scalar_one_or_none():
            continue
        m = SEOMonitor(
            user_id=effective_owner_id,
            website_id=website_id,
            url=url,
            label=payload.label,
            check_frequency=payload.check_frequency,
            channels=[c for c in payload.channels if c in ("email", "telegram")],
            track_title=payload.track_title,
            track_meta_desc=payload.track_meta_desc,
            track_h1=payload.track_h1,
            track_h2=payload.track_h2,
            track_h3=payload.track_h3,
            track_canonical=payload.track_canonical,
            track_robots=payload.track_robots,
            track_og=payload.track_og,
            track_schema=payload.track_schema,
            track_hreflang=payload.track_hreflang,
            track_links_count=payload.track_links_count,
            track_alt_text=payload.track_alt_text,
            track_full_html=payload.track_full_html,
        )
        db.add(m)
        await db.flush()
        await db.refresh(m)
        created.append(m)

        # Trigger initial scan
        from app.tasks.seo_check_tasks import check_seo_for_url
        check_seo_for_url.delay(website_id, url)

    await db.commit()
    return [_monitor_out(m) for m in created]


@router.put("/monitors/{monitor_id}")
async def update_monitor(
    website_id: int,
    monitor_id: int,
    payload: MonitorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(SEOMonitor).where(SEOMonitor.id == monitor_id, SEOMonitor.website_id == website_id, SEOMonitor.user_id == effective_owner_id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(m, field, value)
    await db.commit()
    await db.refresh(m)
    return _monitor_out(m)


@router.delete("/monitors/{monitor_id}", status_code=204)
async def delete_monitor(
    website_id: int,
    monitor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(SEOMonitor).where(SEOMonitor.id == monitor_id, SEOMonitor.website_id == website_id, SEOMonitor.user_id == effective_owner_id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    await db.delete(m)
    await db.commit()


@router.post("/monitors/{monitor_id}/check")
async def trigger_check(
    website_id: int,
    monitor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(SEOMonitor).where(SEOMonitor.id == monitor_id, SEOMonitor.website_id == website_id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    from app.tasks.seo_check_tasks import check_seo_for_url
    check_seo_for_url.delay(website_id, m.url)
    return {"message": "Vérification démarrée", "url": m.url}


# ── Changes list ──────────────────────────────────────────────────────────────

@router.get("")
async def get_seo_changes(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    limit: int = Query(100, le=500),
    page_url: Optional[str] = Query(None),
):
    await _verify_site(website_id, db, effective_owner_id)
    q = select(SEOChange).where(SEOChange.website_id == website_id)
    if page_url:
        q = q.where(SEOChange.page_url == page_url)
    q = q.order_by(desc(SEOChange.detected_at)).limit(limit)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "page_url": r.page_url,
            "detected_at": str(r.detected_at),
            "field": r.field,
            "old_value": r.old_value,
            "new_value": r.new_value,
        }
        for r in rows
    ]


# ── Snapshot (latest) ─────────────────────────────────────────────────────────

@router.get("/snapshot")
async def get_snapshot(
    website_id: int,
    page_url: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(SEOSnapshot)
        .where(SEOSnapshot.website_id == website_id, SEOSnapshot.page_url == page_url)
        .order_by(desc(SEOSnapshot.recorded_at))
        .limit(1)
    )
    snap = result.scalar_one_or_none()
    if not snap:
        return None
    return {
        "recorded_at": str(snap.recorded_at),
        "title": snap.title,
        "meta_description": snap.meta_description,
        "h1": snap.h1,
        "h2s": snap.h2s,
        "h3s": snap.h3s,
        "canonical": snap.canonical,
        "robots_meta": snap.robots_meta,
        "og_title": snap.og_title,
        "og_description": snap.og_description,
        "schema_types": snap.schema_types,
        "hreflang": snap.hreflang,
        "links_count": snap.links_count,
        "images_without_alt": snap.images_without_alt,
    }
