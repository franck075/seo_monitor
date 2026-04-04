from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional, List
from app.db.session import get_db
from app.models.website import Website
from app.models.links import LinkReport, BacklinkEntry, ReferringDomainEntry, AnchorTextEntry, BacklinkMonitor
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from pydantic import BaseModel

router = APIRouter(prefix="/websites/{website_id}/links", tags=["links"])


async def _verify_site(website_id: int, db: AsyncSession, owner_id: int) -> Website:
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == owner_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    return site


# ── Pydantic ──────────────────────────────────────────────────────────────────

class AhrefsKeyPayload(BaseModel):
    api_key: str


class MonitorCreate(BaseModel):
    targets: List[str]
    label: Optional[str] = None
    notify_new: bool = False
    notify_suspicious: bool = True
    dr_threshold: int = 10
    channels: List[str] = ["email"]


class MonitorUpdate(BaseModel):
    label: Optional[str] = None
    is_active: Optional[bool] = None
    notify_new: Optional[bool] = None
    notify_suspicious: Optional[bool] = None
    dr_threshold: Optional[int] = None
    channels: Optional[List[str]] = None


def _monitor_out(m: BacklinkMonitor) -> dict:
    return {
        "id": m.id,
        "target": m.target,
        "label": m.label or m.target,
        "is_active": m.is_active,
        "notify_new": m.notify_new,
        "notify_suspicious": m.notify_suspicious,
        "dr_threshold": m.dr_threshold,
        "channels": m.channels or [],
        "last_checked_at": str(m.last_checked_at) if m.last_checked_at else None,
        "created_at": str(m.created_at),
    }


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    return {"has_ahrefs_key": bool(site.ahrefs_api_key_enc)}


@router.put("/settings")
async def save_ahrefs_key(
    website_id: int,
    payload: AhrefsKeyPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    from app.core.crypto import encrypt_credentials
    site.ahrefs_api_key_enc = encrypt_credentials({"api_key": payload.api_key.strip()})
    await db.commit()
    return {"status": "saved"}


@router.delete("/settings")
async def delete_ahrefs_key(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    site.ahrefs_api_key_enc = None
    await db.commit()
    return {"status": "deleted"}


# ── Manual refresh ─────────────────────────────────────────────────────────────

@router.post("/refresh")
async def trigger_refresh(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    if not site.ahrefs_api_key_enc:
        raise HTTPException(status_code=400, detail="Clé Ahrefs non configurée")
    from app.tasks.link_tasks import pull_links_for_site
    pull_links_for_site.delay(website_id)
    return {"message": "Actualisation démarrée"}


# ── Overview / History ─────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)

    # Latest report
    latest_r = await db.execute(
        select(LinkReport)
        .where(LinkReport.website_id == website_id)
        .order_by(desc(LinkReport.recorded_at))
        .limit(1)
    )
    latest = latest_r.scalar_one_or_none()

    # Last 30 days history for chart
    history_r = await db.execute(
        select(LinkReport)
        .where(LinkReport.website_id == website_id)
        .order_by(desc(LinkReport.recorded_at))
        .limit(30)
    )
    history = list(reversed(history_r.scalars().all()))

    # New / lost counts
    new_backlinks_r = await db.execute(
        select(BacklinkEntry).where(BacklinkEntry.website_id == website_id, BacklinkEntry.is_new == True)
    )
    new_backlinks = len(new_backlinks_r.scalars().all())

    lost_backlinks_r = await db.execute(
        select(BacklinkEntry).where(BacklinkEntry.website_id == website_id, BacklinkEntry.is_lost == True)
    )
    lost_backlinks = len(lost_backlinks_r.scalars().all())

    new_domains_r = await db.execute(
        select(ReferringDomainEntry).where(
            ReferringDomainEntry.website_id == website_id,
            ReferringDomainEntry.is_new == True,
        )
    )
    new_domains = len(new_domains_r.scalars().all())

    return {
        "latest": {
            "total_backlinks": latest.total_backlinks if latest else 0,
            "dofollow_backlinks": latest.dofollow_backlinks if latest else 0,
            "nofollow_backlinks": latest.nofollow_backlinks if latest else 0,
            "total_referring_domains": latest.total_referring_domains if latest else 0,
            "recorded_at": str(latest.recorded_at) if latest else None,
        },
        "new_backlinks": new_backlinks,
        "lost_backlinks": lost_backlinks,
        "new_domains": new_domains,
        "history": [
            {
                "date": str(r.recorded_at)[:10],
                "backlinks": r.total_backlinks,
                "referring_domains": r.total_referring_domains,
            }
            for r in history
        ],
    }


# ── Backlinks ─────────────────────────────────────────────────────────────────

@router.get("/backlinks")
async def list_backlinks(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
    only_new: bool = False,
    only_lost: bool = False,
    dofollow_only: bool = False,
):
    await _verify_site(website_id, db, effective_owner_id)
    q = select(BacklinkEntry).where(BacklinkEntry.website_id == website_id)
    if only_new:
        q = q.where(BacklinkEntry.is_new == True)
    if only_lost:
        q = q.where(BacklinkEntry.is_lost == True)
    if dofollow_only:
        q = q.where(BacklinkEntry.is_dofollow == True)
    q = q.order_by(desc(BacklinkEntry.traffic), desc(BacklinkEntry.domain_rating)).offset(offset).limit(limit)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "url_from": r.url_from,
            "domain_from": r.domain_from,
            "url_to": r.url_to,
            "title": r.title,
            "anchor_text": r.anchor_text,
            "snippet_left": r.snippet_left,
            "snippet_right": r.snippet_right,
            "is_dofollow": r.is_dofollow,
            "is_nofollow": r.is_nofollow,
            "is_ugc": r.is_ugc,
            "is_sponsored": r.is_sponsored,
            "is_content": r.is_content,
            "is_spam": r.is_spam,
            "link_type": r.link_type,
            "http_code": r.http_code,
            "domain_rating": float(r.domain_rating) if r.domain_rating else None,
            "url_rating": float(r.url_rating) if r.url_rating else None,
            "traffic": r.traffic,
            "traffic_domain": r.traffic_domain,
            "refdomains_source": r.refdomains_source,
            "first_seen_at": str(r.first_seen_at) if r.first_seen_at else None,
            "last_seen_at": str(r.last_seen_at) if r.last_seen_at else None,
            "lost_reason": r.lost_reason,
            "discovered_status": r.discovered_status,
            "is_new": r.is_new,
            "is_lost": r.is_lost,
        }
        for r in rows
    ]


# ── Referring Domains ─────────────────────────────────────────────────────────

@router.get("/referring-domains")
async def list_referring_domains(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    limit: int = Query(100, le=1000),
    offset: int = Query(0, ge=0),
    only_new: bool = False,
    only_lost: bool = False,
):
    await _verify_site(website_id, db, effective_owner_id)
    q = select(ReferringDomainEntry).where(ReferringDomainEntry.website_id == website_id)
    if only_new:
        q = q.where(ReferringDomainEntry.is_new == True)
    if only_lost:
        q = q.where(ReferringDomainEntry.is_lost == True)
    q = q.order_by(desc(ReferringDomainEntry.domain_rating)).offset(offset).limit(limit)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "domain": r.domain,
            "backlinks_count": r.backlinks_count,
            "is_dofollow": r.is_dofollow,
            "domain_rating": float(r.domain_rating) if r.domain_rating else None,
            "first_seen_at": str(r.first_seen_at) if r.first_seen_at else None,
            "last_seen_at": str(r.last_seen_at) if r.last_seen_at else None,
            "is_new": r.is_new,
            "is_lost": r.is_lost,
        }
        for r in rows
    ]


# ── Anchor Texts ──────────────────────────────────────────────────────────────

@router.get("/anchors")
async def list_anchors(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    limit: int = Query(50, le=100),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(AnchorTextEntry)
        .where(AnchorTextEntry.website_id == website_id)
        .order_by(desc(AnchorTextEntry.backlinks_count))
        .limit(limit)
    )
    rows = result.scalars().all()
    total = sum(r.backlinks_count for r in rows)
    return [
        {
            "anchor": r.anchor,
            "backlinks_count": r.backlinks_count,
            "referring_domains_count": r.referring_domains_count,
            "dofollow_count": r.dofollow_count,
            "percentage": round(r.backlinks_count / total * 100, 1) if total else 0,
        }
        for r in rows
    ]


# ── Backlink Monitors CRUD ────────────────────────────────────────────────────

@router.get("/monitors")
async def list_monitors(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(BacklinkMonitor)
        .where(BacklinkMonitor.website_id == website_id, BacklinkMonitor.user_id == effective_owner_id)
        .order_by(BacklinkMonitor.created_at)
    )
    return [_monitor_out(m) for m in result.scalars().all()]


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
    for raw in payload.targets:
        target = raw.strip().rstrip("/")
        if not target:
            continue
        existing = await db.execute(
            select(BacklinkMonitor).where(
                BacklinkMonitor.website_id == website_id,
                BacklinkMonitor.target == target,
            )
        )
        if existing.scalar_one_or_none():
            continue
        m = BacklinkMonitor(
            user_id=effective_owner_id,
            website_id=website_id,
            target=target,
            label=payload.label,
            notify_new=payload.notify_new,
            notify_suspicious=payload.notify_suspicious,
            dr_threshold=payload.dr_threshold,
            channels=payload.channels,
        )
        db.add(m)
        created.append(m)
    await db.commit()
    for m in created:
        await db.refresh(m)
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
        select(BacklinkMonitor).where(
            BacklinkMonitor.id == monitor_id,
            BacklinkMonitor.website_id == website_id,
            BacklinkMonitor.user_id == effective_owner_id,
        )
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
        select(BacklinkMonitor).where(
            BacklinkMonitor.id == monitor_id,
            BacklinkMonitor.website_id == website_id,
            BacklinkMonitor.user_id == effective_owner_id,
        )
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    await db.delete(m)
    await db.commit()


# ── Suspicious Backlinks ──────────────────────────────────────────────────────

@router.get("/suspicious")
async def list_suspicious(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    include_dismissed: bool = False,
    limit: int = Query(100, le=500),
):
    await _verify_site(website_id, db, effective_owner_id)
    q = select(BacklinkEntry).where(
        BacklinkEntry.website_id == website_id,
        BacklinkEntry.is_suspicious == True,
    )
    if not include_dismissed:
        q = q.where(BacklinkEntry.is_dismissed == False)
    q = q.order_by(desc(BacklinkEntry.updated_at)).limit(limit)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "url_from": r.url_from,
            "domain_from": r.domain_from,
            "url_to": r.url_to,
            "anchor_text": r.anchor_text,
            "domain_rating": float(r.domain_rating) if r.domain_rating else None,
            "is_spam": r.is_spam,
            "is_ugc": r.is_ugc,
            "http_code": r.http_code,
            "suspicious_reason": r.suspicious_reason,
            "is_dismissed": r.is_dismissed,
            "first_seen_at": str(r.first_seen_at) if r.first_seen_at else None,
            "alerted_at": str(r.alerted_at) if r.alerted_at else None,
        }
        for r in rows
    ]


@router.post("/suspicious/{backlink_id}/dismiss")
async def dismiss_suspicious(
    website_id: int,
    backlink_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(BacklinkEntry).where(
            BacklinkEntry.id == backlink_id,
            BacklinkEntry.website_id == website_id,
        )
    )
    bl = result.scalar_one_or_none()
    if not bl:
        raise HTTPException(status_code=404, detail="Backlink not found")
    bl.is_dismissed = True
    await db.commit()
    return {"status": "dismissed"}
