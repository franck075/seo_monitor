from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, text
from app.db.session import get_db
from app.models.website import Website
from app.models.monitoring import TrafficSnapshot
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from datetime import date, timedelta

router = APIRouter(prefix="/websites/{website_id}/traffic", tags=["traffic"])


async def _verify_site(website_id: int, db: AsyncSession, owner_id: int):
    from fastapi import HTTPException
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == owner_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    return site


@router.get("/debug-channels")
async def get_traffic_debug_channels(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    days: int = Query(30),
):
    """Debug: affiche tous les canaux GA4 avec leurs sessions pour identifier le bon filtre."""
    from fastapi import HTTPException
    from app.models.user import UserAPICredential
    from app.core.crypto import decrypt_credentials
    from app.services.ga4_service import GA4Service

    site = await _verify_site(website_id, db, effective_owner_id)

    if not site.ga4_property_id or not site.ga4_cred_id:
        return {"error": "GA4 non configuré"}

    cred = (await db.execute(
        select(UserAPICredential).where(UserAPICredential.id == site.ga4_cred_id)
    )).scalar_one_or_none()
    if not cred:
        return {"error": "Credential GA4 introuvable"}

    try:
        credentials_json = decrypt_credentials(cred.credentials_enc)
        ga4 = GA4Service(credentials_json=credentials_json, property_id=site.ga4_property_id)
        channels = ga4.get_channel_breakdown(days=days)
        return {"channels": channels, "days": days, "property_id": site.ga4_property_id}
    except Exception as e:
        return {"error": str(e)}


@router.get("/zero-organic-pages")
async def get_zero_organic_pages(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(30),
):
    """Pages ayant eu des visites mais 0 session organique sur la période."""
    from app.models.user import UserAPICredential
    from app.core.crypto import decrypt_credentials
    from app.services.ga4_service import GA4Service

    site = await _verify_site(website_id, db, effective_owner_id)

    if not site.ga4_property_id or not site.ga4_cred_id:
        return {"has_data": False, "reason": "GA4 non configuré"}

    cred = (await db.execute(
        select(UserAPICredential).where(UserAPICredential.id == site.ga4_cred_id)
    )).scalar_one_or_none()
    if not cred:
        return {"has_data": False, "reason": "Credential GA4 introuvable"}

    try:
        credentials_json = decrypt_credentials(cred.credentials_enc)
        ga4 = GA4Service(credentials_json=credentials_json, property_id=site.ga4_property_id)

        end = date.today()
        start = end - timedelta(days=period - 1)

        all_pages = set(ga4.get_pages_with_any_traffic(start=start, end=end))
        organic_pages = set(ga4.get_pages_with_organic_traffic(start=start, end=end))
        zero_pages = sorted(all_pages - organic_pages)
    except Exception as e:
        return {"has_data": False, "reason": str(e)}

    return {
        "has_data": True,
        "period": period,
        "start": str(start),
        "end": str(end),
        "all_pages_count": len(all_pages),
        "organic_pages_count": len(organic_pages),
        "zero_organic_count": len(zero_pages),
        "pages": zero_pages,
    }


@router.get("/live-stats")
async def get_traffic_live_stats(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(30),
):
    """Stats GA4 directement depuis l'API — garanti identique à Google Analytics."""
    from fastapi import HTTPException
    from app.models.user import UserAPICredential
    from app.core.crypto import decrypt_credentials
    from app.services.ga4_service import GA4Service

    site = await _verify_site(website_id, db, effective_owner_id)

    if not site.ga4_property_id or not site.ga4_cred_id:
        return {"has_data": False, "reason": "GA4 non configuré"}

    cred = (await db.execute(
        select(UserAPICredential).where(UserAPICredential.id == site.ga4_cred_id)
    )).scalar_one_or_none()
    if not cred:
        return {"has_data": False, "reason": "Credential GA4 introuvable"}

    try:
        credentials_json = decrypt_credentials(cred.credentials_enc)
        ga4 = GA4Service(credentials_json=credentials_json, property_id=site.ga4_property_id)

        # Période courante: aujourd'hui - (period-1) jours → aujourd'hui
        curr_end = date.today()
        curr_start = curr_end - timedelta(days=period - 1)
        # Période précédente: même durée, juste avant
        prev_end = curr_start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=period - 1)

        # Totaux réels sans double-comptage des users (requête sans dimension date)
        curr = ga4.get_organic_totals(start=curr_start, end=curr_end)
        prev = ga4.get_organic_totals(start=prev_start, end=prev_end)
        curr = {
            "sessions": curr["sessions"],
            "users": curr["users"],
            "pageviews": curr["pageviews"],
            "bounce_rate": round(curr["bounce_rate"] * 100, 1),
            "avg_duration": round(curr["avg_session_duration"], 0),
        }
        prev = {
            "sessions": prev["sessions"],
            "users": prev["users"],
            "pageviews": prev["pageviews"],
            "bounce_rate": round(prev["bounce_rate"] * 100, 1),
            "avg_duration": round(prev["avg_session_duration"], 0),
        }

        # Tendance quotidienne (avec dimension date)
        curr_rows = ga4.get_organic_traffic_range(start=curr_start, end=curr_end)
    except Exception as e:
        return {"has_data": False, "reason": str(e)}

    def pct(a, b):
        return round((a - b) / b * 100, 1) if b else None

    trend = sorted([
        {
            "date": r["date"],
            "sessions": r["sessions"],
            "users": r["users"],
            "pageviews": r["pageviews"],
            "bounce_rate": round(r["bounce_rate"] * 100, 1),
            "avg_duration": round(r["avg_session_duration"], 0),
        }
        for r in curr_rows
    ], key=lambda x: x["date"])

    latest_date = trend[-1]["date"] if trend else str(date.today())
    last7 = trend[-7:] if len(trend) >= 7 else trend
    avg7 = round(sum(d["sessions"] for d in last7) / len(last7), 1) if last7 else 0

    return {
        "has_data": True,
        "latest_date": latest_date,
        "period": period,
        "source": "live_ga4",
        "current": curr,
        "previous": prev,
        "changes": {
            "sessions": pct(curr["sessions"], prev["sessions"]),
            "users": pct(curr["users"], prev["users"]),
            "pageviews": pct(curr["pageviews"], prev["pageviews"]),
            "bounce_rate": pct(curr["bounce_rate"], prev["bounce_rate"]),
        },
        "trend": trend,
        "best_day": max(trend, key=lambda x: x["sessions"]) if trend else None,
        "worst_day": min(trend, key=lambda x: x["sessions"]) if trend else None,
        "avg7_sessions": avg7,
        "latest_sessions": trend[-1]["sessions"] if trend else 0,
    }


@router.get("/stats")
async def get_traffic_stats(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(30),  # days
):
    await _verify_site(website_id, db, effective_owner_id)

    # Latest date available
    latest_result = await db.execute(
        select(func.max(TrafficSnapshot.recorded_date))
        .where(TrafficSnapshot.website_id == website_id)
    )
    latest_date = latest_result.scalar()
    if not latest_date:
        return {"has_data": False}

    curr_end = latest_date
    curr_start = latest_date - timedelta(days=period - 1)
    prev_end = curr_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period - 1)

    async def _agg(start: date, end: date):
        r = await db.execute(
            select(
                func.sum(TrafficSnapshot.sessions),
                func.sum(TrafficSnapshot.users),
                func.sum(TrafficSnapshot.pageviews),
                func.avg(TrafficSnapshot.bounce_rate),
                func.avg(TrafficSnapshot.avg_session_duration),
                func.count(TrafficSnapshot.id),
            )
            .where(
                TrafficSnapshot.website_id == website_id,
                TrafficSnapshot.source == "organic",
                TrafficSnapshot.recorded_date >= start,
                TrafficSnapshot.recorded_date <= end,
            )
        )
        row = r.fetchone()
        return {
            "sessions": int(row[0] or 0),
            "users": int(row[1] or 0),
            "pageviews": int(row[2] or 0),
            "bounce_rate": round(float(row[3] or 0) * 100, 1),
            "avg_duration": round(float(row[4] or 0), 0),
            "days": int(row[5] or 0),
        }

    curr = await _agg(curr_start, curr_end)
    prev = await _agg(prev_start, prev_end)

    def pct_change(a, b):
        if b == 0:
            return None
        return round((a - b) / b * 100, 1)

    # Daily trend
    trend_result = await db.execute(
        select(
            TrafficSnapshot.recorded_date,
            TrafficSnapshot.sessions,
            TrafficSnapshot.users,
            TrafficSnapshot.pageviews,
            TrafficSnapshot.bounce_rate,
            TrafficSnapshot.avg_session_duration,
        )
        .where(
            TrafficSnapshot.website_id == website_id,
            TrafficSnapshot.source == "organic",
            TrafficSnapshot.recorded_date >= curr_start,
            TrafficSnapshot.recorded_date <= curr_end,
        )
        .order_by(TrafficSnapshot.recorded_date)
    )
    trend = [
        {
            "date": str(r[0]),
            "sessions": r[1] or 0,
            "users": r[2] or 0,
            "pageviews": r[3] or 0,
            "bounce_rate": round(float(r[4] or 0) * 100, 1),
            "avg_duration": round(float(r[5] or 0), 0),
        }
        for r in trend_result.fetchall()
    ]

    # Best and worst days
    if trend:
        best_day = max(trend, key=lambda x: x["sessions"])
        worst_day = min(trend, key=lambda x: x["sessions"])
    else:
        best_day = worst_day = None

    # 7-day rolling average for anomaly context
    last7 = trend[-7:] if len(trend) >= 7 else trend
    avg7 = round(sum(d["sessions"] for d in last7) / len(last7), 1) if last7 else 0
    latest_day_sessions = trend[-1]["sessions"] if trend else 0

    return {
        "has_data": True,
        "latest_date": str(latest_date),
        "period": period,
        "current": {**curr, "pct_sessions": None, "pct_users": None, "pct_pageviews": None},
        "previous": prev,
        "changes": {
            "sessions": pct_change(curr["sessions"], prev["sessions"]),
            "users": pct_change(curr["users"], prev["users"]),
            "pageviews": pct_change(curr["pageviews"], prev["pageviews"]),
            "bounce_rate": pct_change(curr["bounce_rate"], prev["bounce_rate"]),
        },
        "trend": trend,
        "best_day": best_day,
        "worst_day": worst_day,
        "avg7_sessions": avg7,
        "latest_sessions": latest_day_sessions,
    }


@router.get("")
async def get_traffic(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    days: int = Query(30),
    source: str = Query("organic"),
):
    await _verify_site(website_id, db, effective_owner_id)

    latest_result = await db.execute(
        select(func.max(TrafficSnapshot.recorded_date))
        .where(TrafficSnapshot.website_id == website_id)
    )
    latest_date = latest_result.scalar()
    if not latest_date:
        return []

    start = latest_date - timedelta(days=days - 1)

    result = await db.execute(
        select(TrafficSnapshot)
        .where(
            TrafficSnapshot.website_id == website_id,
            TrafficSnapshot.source == source,
            TrafficSnapshot.recorded_date >= start,
            TrafficSnapshot.recorded_date <= latest_date,
        )
        .order_by(TrafficSnapshot.recorded_date.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "date": str(r.recorded_date),
            "sessions": r.sessions,
            "users": r.users,
            "new_users": r.new_users,
            "pageviews": r.pageviews,
            "bounce_rate": round(float(r.bounce_rate) * 100, 1) if r.bounce_rate else None,
            "avg_session_duration": round(float(r.avg_session_duration), 0) if r.avg_session_duration else None,
        }
        for r in rows
    ]
