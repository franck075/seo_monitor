from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from typing import Optional, List
from app.db.session import get_db
from app.models.website import Website
from app.models.monitoring import HTTPCheck, HTTPMonitor
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from pydantic import BaseModel

router = APIRouter(prefix="/websites/{website_id}/http-checks", tags=["http-checks"])


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
    check_frequency: str = "daily"
    notify_on_error: bool = True
    notify_on_redirect: bool = False
    notify_on_slow: bool = False
    slow_threshold_ms: int = 3000
    channels: List[str] = ["email"]


class MonitorUpdate(BaseModel):
    label: Optional[str] = None
    is_active: Optional[bool] = None
    check_frequency: Optional[str] = None
    notify_on_error: Optional[bool] = None
    notify_on_redirect: Optional[bool] = None
    notify_on_slow: Optional[bool] = None
    slow_threshold_ms: Optional[int] = None
    channels: Optional[List[str]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _status_category(code: Optional[int]) -> str:
    if code is None:
        return "timeout"
    if code < 300:
        return "ok"
    if code < 400:
        return "redirect"
    if code < 500:
        return "error_4xx"
    return "error_5xx"


async def _uptime_pct(db: AsyncSession, website_id: int, url: str, last_n: int = 30) -> Optional[float]:
    result = await db.execute(
        select(HTTPCheck.is_error)
        .where(HTTPCheck.website_id == website_id, HTTPCheck.page_url == url)
        .order_by(desc(HTTPCheck.checked_at))
        .limit(last_n)
    )
    rows = result.all()
    if not rows:
        return None
    ok = sum(1 for r in rows if not r[0])
    return round(ok / len(rows) * 100, 1)


def _monitor_out(m: HTTPMonitor) -> dict:
    return {
        "id": m.id,
        "url": m.url,
        "label": m.label or m.url.replace("https://", "").replace("http://", ""),
        "is_active": m.is_active,
        "check_frequency": m.check_frequency,
        "notify_on_error": m.notify_on_error,
        "notify_on_redirect": m.notify_on_redirect,
        "notify_on_slow": m.notify_on_slow,
        "slow_threshold_ms": m.slow_threshold_ms,
        "channels": m.channels or [],
        "last_status_code": m.last_status_code,
        "last_response_time": float(m.last_response_time) if m.last_response_time else None,
        "last_checked_at": str(m.last_checked_at) if m.last_checked_at else None,
        "created_at": str(m.created_at),
        "status_category": _status_category(m.last_status_code),
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
        select(HTTPMonitor)
        .where(HTTPMonitor.website_id == website_id, HTTPMonitor.user_id == effective_owner_id)
        .order_by(HTTPMonitor.created_at)
    )
    monitors = result.scalars().all()

    out = []
    for m in monitors:
        d = _monitor_out(m)
        d["uptime_pct"] = await _uptime_pct(db, website_id, m.url)
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
            select(HTTPMonitor).where(HTTPMonitor.website_id == website_id, HTTPMonitor.url == url)
        )
        if existing.scalar_one_or_none():
            continue
        m = HTTPMonitor(
            user_id=effective_owner_id,
            website_id=website_id,
            url=url,
            label=payload.label,
            check_frequency=payload.check_frequency,
            notify_on_error=payload.notify_on_error,
            notify_on_redirect=payload.notify_on_redirect,
            notify_on_slow=payload.notify_on_slow,
            slow_threshold_ms=payload.slow_threshold_ms,
            channels=payload.channels,
        )
        db.add(m)
        await db.flush()
        await db.refresh(m)
        created.append(m)

        # Trigger immediate check
        from app.tasks.http_check_tasks import check_http_for_url
        check_http_for_url.delay(website_id, url)

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
        select(HTTPMonitor).where(HTTPMonitor.id == monitor_id, HTTPMonitor.website_id == website_id, HTTPMonitor.user_id == effective_owner_id)
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
        select(HTTPMonitor).where(HTTPMonitor.id == monitor_id, HTTPMonitor.website_id == website_id, HTTPMonitor.user_id == effective_owner_id)
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
        select(HTTPMonitor).where(HTTPMonitor.id == monitor_id, HTTPMonitor.website_id == website_id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")
    from app.tasks.http_check_tasks import check_http_for_url
    check_http_for_url.delay(website_id, m.url)
    return {"message": "Vérification démarrée", "url": m.url}


@router.get("/monitors/{monitor_id}/history")
async def get_monitor_history(
    website_id: int,
    monitor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    limit: int = Query(30, le=100),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(HTTPMonitor).where(HTTPMonitor.id == monitor_id, HTTPMonitor.website_id == website_id, HTTPMonitor.user_id == effective_owner_id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Monitor not found")

    checks_result = await db.execute(
        select(HTTPCheck)
        .where(HTTPCheck.website_id == website_id, HTTPCheck.page_url == m.url)
        .order_by(desc(HTTPCheck.checked_at))
        .limit(limit)
    )
    rows = checks_result.scalars().all()
    return [
        {
            "checked_at": str(r.checked_at),
            "status_code": r.status_code,
            "response_time": float(r.response_time) if r.response_time else None,
            "is_error": r.is_error,
            "redirect_url": r.redirect_url,
        }
        for r in reversed(rows)
    ]


# ── Legacy checks list ────────────────────────────────────────────────────────

@router.get("")
async def get_http_checks(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    errors_only: bool = Query(False),
    limit: int = Query(100, le=500),
):
    await _verify_site(website_id, db, effective_owner_id)
    q = select(HTTPCheck).where(HTTPCheck.website_id == website_id)
    if errors_only:
        q = q.where(HTTPCheck.is_error == True)
    q = q.order_by(desc(HTTPCheck.checked_at)).limit(limit)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "page_url": r.page_url,
            "checked_at": str(r.checked_at),
            "status_code": r.status_code,
            "redirect_url": r.redirect_url,
            "redirect_chain": r.redirect_chain,
            "response_time": float(r.response_time) if r.response_time else None,
            "is_error": r.is_error,
        }
        for r in rows
    ]
