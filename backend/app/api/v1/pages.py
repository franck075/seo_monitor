"""Top Pages + per-page details endpoints (GSC page dimension)."""
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.db.session import get_db
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User, UserAPICredential
from app.models.website import Website
from app.models.monitoring import CoreWebVital, SEOSnapshot, HTTPCheck
from app.core.crypto import decrypt_credentials

router = APIRouter(prefix="/websites/{website_id}/pages", tags=["pages"])


async def _verify_site(website_id: int, db: AsyncSession, owner_id: int) -> Website:
    result = await db.execute(
        select(Website).where(Website.id == website_id, Website.user_id == owner_id)
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site introuvable")
    return site


async def _gsc_for_site(site: Website, db: AsyncSession):
    if not site.gsc_property or not site.gsc_cred_id:
        return None
    cred = (await db.execute(
        select(UserAPICredential).where(UserAPICredential.id == site.gsc_cred_id)
    )).scalar_one_or_none()
    if not cred:
        return None
    from app.services.gsc_service import GSCService
    try:
        return GSCService(decrypt_credentials(cred.credentials_enc), site.gsc_property)
    except Exception:
        return None


def _pct(curr: float, prev: float) -> Optional[float]:
    if prev == 0:
        return None
    return round((curr - prev) / prev * 100, 1)


def _diff(curr: float, prev: float) -> float:
    return round(curr - prev, 2)


@router.get("/top")
async def get_top_pages(
    website_id: int,
    period: int = Query(28, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Per-page GSC metrics with period-over-period comparison.

    Returns: list of pages with current + previous clicks/impressions/ctr/position
    and their absolute/percent change, sorted by current clicks descending.
    """
    site = await _verify_site(website_id, db, effective_owner_id)
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site"}

    curr_end = date.today()
    curr_start = curr_end - timedelta(days=period - 1)
    prev_end = curr_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period - 1)

    try:
        curr_rows = gsc.get_top_pages_for_period(str(curr_start), str(curr_end))
        prev_rows = gsc.get_top_pages_for_period(str(prev_start), str(prev_end))
    except Exception as e:
        return {"has_data": False, "reason": str(e)}

    prev_by_page = {r["page"]: r for r in prev_rows}

    combined = []
    for r in curr_rows:
        p = prev_by_page.get(r["page"], {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0})
        combined.append({
            "page": r["page"],
            "impressions": r["impressions"],
            "clicks": r["clicks"],
            "ctr": r["ctr"],
            "position": r["position"],
            "prev_impressions": p["impressions"],
            "prev_clicks": p["clicks"],
            "prev_ctr": p["ctr"],
            "prev_position": p["position"],
            "impressions_change": r["impressions"] - p["impressions"],
            "clicks_change": r["clicks"] - p["clicks"],
            "ctr_change": _diff(r["ctr"], p["ctr"]),
            "position_change": _diff(r["position"], p["position"]),
            "impressions_change_pct": _pct(r["impressions"], p["impressions"]),
            "clicks_change_pct": _pct(r["clicks"], p["clicks"]),
        })

    combined.sort(key=lambda x: x["clicks"], reverse=True)

    # Winners: pages with growing clicks (>10% increase, >5 clicks)
    winners = sorted(
        [c for c in combined if (c["clicks_change_pct"] or 0) > 10 and c["clicks_change"] > 5],
        key=lambda x: x["clicks_change"],
        reverse=True,
    )

    # Losers: pages with declining clicks (>10% decrease, >5 clicks lost)
    losers = sorted(
        [c for c in combined if (c["clicks_change_pct"] or 0) < -10 and c["clicks_change"] < -5],
        key=lambda x: x["clicks_change"],
    )

    return {
        "has_data": True,
        "period": period,
        "current_range": {"start": str(curr_start), "end": str(curr_end)},
        "previous_range": {"start": str(prev_start), "end": str(prev_end)},
        "top_performers": combined[:50],
        "winners": winners[:50],
        "losers": losers[:50],
        "total_pages": len(combined),
    }


@router.get("/details")
async def get_page_details(
    website_id: int,
    url: str = Query(..., description="Full page URL"),
    period: int = Query(28, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """All metrics we have for one page URL: GSC, top queries, vitals, SEO, HTTP."""
    site = await _verify_site(website_id, db, effective_owner_id)

    curr_end = date.today()
    curr_start = curr_end - timedelta(days=period - 1)
    prev_end = curr_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period - 1)

    out: dict = {
        "url": url,
        "period": period,
        "current_range": {"start": str(curr_start), "end": str(curr_end)},
        "previous_range": {"start": str(prev_start), "end": str(prev_end)},
    }

    # GSC
    gsc = await _gsc_for_site(site, db)
    if gsc:
        try:
            curr = gsc.get_page_metrics(url, str(curr_start), str(curr_end))
            prev = gsc.get_page_metrics(url, str(prev_start), str(prev_end))
            top_queries = gsc.get_top_queries_for_page(url, str(curr_start), str(curr_end), row_limit=20)
            out["search"] = {
                "current": curr,
                "previous": prev,
                "changes": {
                    "clicks_pct": _pct(curr["clicks"], prev["clicks"]),
                    "impressions_pct": _pct(curr["impressions"], prev["impressions"]),
                    "ctr_diff": _diff(curr["ctr"], prev["ctr"]),
                    "position_diff": _diff(curr["position"], prev["position"]),
                },
                "top_queries": top_queries,
            }
        except Exception as e:
            out["search"] = {"error": str(e)}
    else:
        out["search"] = None

    # Core Web Vitals (latest snapshot for mobile + desktop)
    vitals_rows = (await db.execute(
        select(CoreWebVital)
        .where(CoreWebVital.website_id == website_id, CoreWebVital.page_url == url)
        .order_by(desc(CoreWebVital.recorded_at))
        .limit(10)
    )).scalars().all()

    def _vital(strategy: str):
        for v in vitals_rows:
            if v.strategy == strategy:
                return {
                    "lcp": float(v.lcp) if v.lcp is not None else None,
                    "cls": float(v.cls) if v.cls is not None else None,
                    "inp": float(v.inp) if v.inp is not None else None,
                    "ttfb": float(v.ttfb) if v.ttfb is not None else None,
                    "fcp": float(v.fcp) if v.fcp is not None else None,
                    "performance_score": v.performance_score,
                    "lcp_rating": v.lcp_rating,
                    "cls_rating": v.cls_rating,
                    "inp_rating": v.inp_rating,
                    "recorded_at": v.recorded_at.isoformat() if v.recorded_at else None,
                }
        return None

    out["vitals"] = {"mobile": _vital("mobile"), "desktop": _vital("desktop")}

    # Latest SEO snapshot
    snap = (await db.execute(
        select(SEOSnapshot)
        .where(SEOSnapshot.website_id == website_id, SEOSnapshot.page_url == url)
        .order_by(desc(SEOSnapshot.recorded_at))
        .limit(1)
    )).scalar_one_or_none()
    if snap:
        out["seo"] = {
            "title": snap.title,
            "meta_description": snap.meta_description,
            "h1": snap.h1,
            "h2_count": len(snap.h2s) if snap.h2s else 0,
            "canonical": snap.canonical,
            "robots_meta": snap.robots_meta,
            "og_title": snap.og_title,
            "og_description": snap.og_description,
            "recorded_at": snap.recorded_at.isoformat() if snap.recorded_at else None,
        }
    else:
        out["seo"] = None

    # Latest HTTP check
    http = (await db.execute(
        select(HTTPCheck)
        .where(HTTPCheck.website_id == website_id, HTTPCheck.page_url == url)
        .order_by(desc(HTTPCheck.checked_at))
        .limit(1)
    )).scalar_one_or_none()
    if http:
        out["http"] = {
            "status_code": http.status_code,
            "response_time": float(http.response_time) if http.response_time is not None else None,
            "redirect_url": http.redirect_url,
            "is_error": http.is_error,
            "checked_at": http.checked_at.isoformat() if http.checked_at else None,
        }
    else:
        out["http"] = None

    return out
