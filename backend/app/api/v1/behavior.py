"""GA4 behavior analytics: page opportunities, movements, and acquisition channels."""
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User, UserAPICredential
from app.models.website import Website
from app.core.crypto import decrypt_credentials

router = APIRouter(prefix="/websites/{website_id}/behavior", tags=["behavior"])


async def _verify_site(website_id: int, db: AsyncSession, owner_id: int) -> Website:
    result = await db.execute(
        select(Website).where(Website.id == website_id, Website.user_id == owner_id)
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site introuvable")
    return site


async def _ga4_for_site(site: Website, db: AsyncSession):
    if not site.ga4_property_id or not site.ga4_cred_id:
        return None
    cred = (await db.execute(
        select(UserAPICredential).where(UserAPICredential.id == site.ga4_cred_id)
    )).scalar_one_or_none()
    if not cred:
        return None
    from app.services.ga4_service import GA4Service
    try:
        return GA4Service(decrypt_credentials(cred.credentials_enc), site.ga4_property_id)
    except Exception:
        return None


def _pct(curr: float, prev: float) -> Optional[float]:
    if prev == 0:
        return None
    return round((curr - prev) / prev * 100, 1)


@router.get("/pages")
async def behavior_pages(
    website_id: int,
    period: int = Query(28, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Page opportunities & movements from GA4: hidden gems, leaking, surging,
    declining, new and lost pages — all from one current-vs-previous comparison."""
    site = await _verify_site(website_id, db, effective_owner_id)
    ga4 = await _ga4_for_site(site, db)
    if not ga4:
        return {"has_data": False, "reason": "GA4 non configuré pour ce site"}

    curr_end = date.today()
    curr_start = curr_end - timedelta(days=period - 1)
    prev_end = curr_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period - 1)

    try:
        curr = ga4.get_page_engagement_range(str(curr_start), str(curr_end))
        prev = ga4.get_page_engagement_range(str(prev_start), str(prev_end))
    except Exception as e:
        return {"has_data": False, "reason": str(e)}

    prev_by_page = {p["page"]: p for p in prev}
    curr_by_page = {p["page"]: p for p in curr}

    # Median sessions to define "low traffic" for hidden gems
    sessions_sorted = sorted([p["sessions"] for p in curr if p["sessions"] > 0])
    median_sessions = sessions_sorted[len(sessions_sorted) // 2] if sessions_sorted else 0

    # ── Hidden gems: high engagement, low-ish traffic. Score favors engagement. ──
    hidden_gems = []
    for p in curr:
        if p["sessions"] < 3:
            continue
        if p["sessions"] > max(median_sessions, 10):
            continue
        if p["engagement_rate"] < 60:
            continue
        score = round(p["engagement_rate"] * p["avg_engagement_time"] / 10)
        hidden_gems.append({**p, "score": score})
    hidden_gems.sort(key=lambda x: x["score"], reverse=True)

    # ── Leaking: real traffic but very poor engagement. ──
    leaking = [
        p for p in curr
        if p["sessions"] >= max(median_sessions, 10) and p["engagement_rate"] < 30
    ]
    leaking.sort(key=lambda x: (x["engagement_rate"], -x["sessions"]))

    # ── Surging / declining (sessions change vs previous, pages present in both) ──
    movements = []
    for page, c in curr_by_page.items():
        p = prev_by_page.get(page)
        if not p or p["sessions"] < 5:
            continue
        change = _pct(c["sessions"], p["sessions"])
        if change is None:
            continue
        movements.append({
            "page": page, "sessions": c["sessions"], "prev_sessions": p["sessions"],
            "change_pct": change, "engagement_rate": c["engagement_rate"],
        })
    surging = sorted([m for m in movements if m["change_pct"] > 20], key=lambda x: x["change_pct"], reverse=True)
    declining = sorted([m for m in movements if m["change_pct"] < -20], key=lambda x: x["change_pct"])

    # ── New / lost pages ──
    new_pages = sorted(
        [{"page": p, "sessions": c["sessions"], "engagement_rate": c["engagement_rate"]}
         for p, c in curr_by_page.items() if p not in prev_by_page and c["sessions"] > 0],
        key=lambda x: x["sessions"], reverse=True,
    )
    lost_pages = sorted(
        [{"page": p, "prev_sessions": prev_by_page[p]["sessions"]}
         for p in prev_by_page if p not in curr_by_page and prev_by_page[p]["sessions"] > 0],
        key=lambda x: x["prev_sessions"], reverse=True,
    )

    return {
        "has_data": True,
        "period": period,
        "hidden_gems": hidden_gems[:8],
        "leaking": leaking[:8],
        "surging": surging[:8],
        "declining": declining[:8],
        "new_pages": new_pages[:8],
        "lost_pages": lost_pages[:8],
    }


@router.get("/channels")
async def behavior_channels(
    website_id: int,
    period: int = Query(90, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Acquisition channels: split, daily stacked series, and engagement funnel."""
    site = await _verify_site(website_id, db, effective_owner_id)
    ga4 = await _ga4_for_site(site, db)
    if not ga4:
        return {"has_data": False, "reason": "GA4 non configuré pour ce site"}

    end = date.today()
    start = end - timedelta(days=period - 1)

    try:
        channels = ga4.get_channel_breakdown_range(str(start), str(end))
        by_date = ga4.get_channel_by_date(str(start), str(end))
    except Exception as e:
        return {"has_data": False, "reason": str(e)}

    total_sessions = sum(c["sessions"] for c in channels) or 1
    for c in channels:
        c["pct"] = round(c["sessions"] / total_sessions * 100, 1)

    # Pivot daily series: {date, <channel>: sessions, ...}
    all_channels = sorted({r["channel"] for r in by_date})
    date_map: Dict[str, Dict[str, Any]] = {}
    for r in by_date:
        bucket = date_map.setdefault(r["date"], {"date": r["date"]})
        bucket[r["channel"]] = r["sessions"]
    series = []
    for dt in sorted(date_map.keys()):
        row = {"date": dt}
        for ch in all_channels:
            row[ch] = date_map[dt].get(ch, 0)
        series.append(row)

    return {
        "has_data": True,
        "period": period,
        "total_sessions": total_sessions,
        "channels": channels,
        "channel_names": all_channels,
        "series": series,
    }
