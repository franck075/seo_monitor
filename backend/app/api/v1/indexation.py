from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from typing import Optional, List
from app.db.session import get_db
from app.models.website import Website
from app.models.monitoring import IndexationMonitor, IndexationError
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from pydantic import BaseModel

router = APIRouter(prefix="/websites/{website_id}/indexation", tags=["indexation"])

NOT_INDEXED_STATES = {
    "CRAWLED_CURRENTLY_NOT_INDEXED",
    "DISCOVERED_CURRENTLY_NOT_INDEXED",
    "NOT_INDEXED",
    "URL_UNKNOWN",
    "SOFT_404",
    "NOT_FOUND",
    "SERVER_ERROR",
}
BLOCKED_STATES = {
    "BLOCKED_BY_ROBOTS_TXT",
    "BLOCKED_BY_META_TAG",
    "BLOCKED_BY_HTTP_HEADER",
}
INDEXED_STATES = {
    "SUBMITTED_AND_INDEXED",
    "INDEXED_NOT_SUBMITTED_IN_SITEMAP",
}


async def _verify_site(website_id: int, db: AsyncSession, owner_id: int) -> Website:
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == owner_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    return site


# ── Pydantic ──────────────────────────────────────────────────────────────────

class MonitorCreate(BaseModel):
    urls: List[str]
    label: Optional[str] = None
    notify_not_indexed: bool = True
    notify_blocked: bool = True
    notify_recovered: bool = True
    channels: List[str] = ["email"]


class MonitorUpdate(BaseModel):
    label: Optional[str] = None
    is_active: Optional[bool] = None
    notify_not_indexed: Optional[bool] = None
    notify_blocked: Optional[bool] = None
    notify_recovered: Optional[bool] = None
    channels: Optional[List[str]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _state_category(state: Optional[str]) -> str:
    if not state:
        return "unknown"
    if state in INDEXED_STATES:
        return "indexed"
    if state in NOT_INDEXED_STATES:
        return "not_indexed"
    if state in BLOCKED_STATES:
        return "blocked"
    return "other"


def _monitor_out(m: IndexationMonitor) -> dict:
    return {
        "id": m.id,
        "url": m.url,
        "label": m.label or m.url.replace("https://", "").replace("http://", ""),
        "is_active": m.is_active,
        "last_coverage_state": m.last_coverage_state,
        "last_indexing_state": m.last_indexing_state,
        "last_robots_state": m.last_robots_state,
        "last_crawl_time": str(m.last_crawl_time) if m.last_crawl_time else None,
        "last_checked_at": str(m.last_checked_at) if m.last_checked_at else None,
        "state_category": _state_category(m.last_coverage_state),
        "notify_not_indexed": m.notify_not_indexed,
        "notify_blocked": m.notify_blocked,
        "notify_recovered": m.notify_recovered,
        "channels": m.channels or [],
        "created_at": str(m.created_at),
    }


# ── Monitor CRUD ──────────────────────────────────────────────────────────────

@router.get("/monitors")
async def list_monitors(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(IndexationMonitor)
        .where(IndexationMonitor.website_id == website_id, IndexationMonitor.user_id == effective_owner_id)
        .order_by(IndexationMonitor.created_at)
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
    for raw_url in payload.urls:
        url = raw_url.strip().rstrip("/")
        if not url.startswith("http"):
            continue
        existing = await db.execute(
            select(IndexationMonitor).where(IndexationMonitor.website_id == website_id, IndexationMonitor.url == url)
        )
        if existing.scalar_one_or_none():
            continue
        m = IndexationMonitor(
            user_id=effective_owner_id,
            website_id=website_id,
            url=url,
            label=payload.label,
            notify_not_indexed=payload.notify_not_indexed,
            notify_blocked=payload.notify_blocked,
            notify_recovered=payload.notify_recovered,
            channels=payload.channels,
        )
        db.add(m)
        await db.flush()
        await db.refresh(m)
        created.append(m)

        # Trigger immediate inspection
        from app.tasks.indexation_tasks import inspect_url
        inspect_url.delay(website_id, url)

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
        select(IndexationMonitor).where(
            IndexationMonitor.id == monitor_id,
            IndexationMonitor.website_id == website_id,
            IndexationMonitor.user_id == effective_owner_id,
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
        select(IndexationMonitor).where(
            IndexationMonitor.id == monitor_id,
            IndexationMonitor.website_id == website_id,
            IndexationMonitor.user_id == effective_owner_id,
        )
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    await db.delete(m)
    await db.commit()


@router.post("/monitors/{monitor_id}/inspect")
async def trigger_inspect(
    website_id: int,
    monitor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(IndexationMonitor).where(IndexationMonitor.id == monitor_id, IndexationMonitor.website_id == website_id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    from app.tasks.indexation_tasks import inspect_url
    inspect_url.delay(website_id, m.url)
    return {"message": "Inspection démarrée", "url": m.url}


@router.get("/monitors/{monitor_id}/history")
async def get_monitor_history(
    website_id: int,
    monitor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    limit: int = Query(20, le=50),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(IndexationMonitor).where(
            IndexationMonitor.id == monitor_id,
            IndexationMonitor.website_id == website_id,
            IndexationMonitor.user_id == effective_owner_id,
        )
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")

    rows_result = await db.execute(
        select(IndexationError)
        .where(IndexationError.website_id == website_id, IndexationError.page_url == m.url)
        .order_by(desc(IndexationError.recorded_at))
        .limit(limit)
    )
    rows = rows_result.scalars().all()
    return [
        {
            "recorded_at": str(r.recorded_at),
            "coverage_state": r.coverage_state,
            "indexing_state": r.indexing_state,
            "robots_state": r.robots_state,
            "last_crawled": str(r.last_crawled) if r.last_crawled else None,
            "is_indexable": r.is_indexable,
            "google_canonical": r.google_canonical,
            "user_canonical": r.user_canonical,
        }
        for r in reversed(rows)
    ]


# ── Legacy errors endpoint ────────────────────────────────────────────────────

@router.get("/errors")
async def get_indexation_errors(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    limit: int = Query(100, le=500),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(IndexationError).where(IndexationError.website_id == website_id)
        .order_by(desc(IndexationError.recorded_at)).limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "page_url": r.page_url,
            "recorded_at": str(r.recorded_at),
            "coverage_state": r.coverage_state,
            "indexing_state": r.indexing_state,
            "is_indexable": r.is_indexable,
        }
        for r in rows
    ]
