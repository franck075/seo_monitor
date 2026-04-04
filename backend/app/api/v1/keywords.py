from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_, case
from typing import Optional, List
from app.db.session import get_db
from app.models.website import Website
from app.models.keyword import Keyword, KeywordPosition
from app.models.alert import MonitoredKeyword
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from pydantic import BaseModel
from datetime import date, timedelta

router = APIRouter(prefix="/websites/{website_id}/keywords", tags=["keywords"])

class KeywordOut(BaseModel):
    id: int
    query: str
    page: Optional[str] = None
    model_config = {"from_attributes": True}

class KeywordPositionOut(BaseModel):
    id: int
    keyword_id: int
    recorded_date: date
    position: Optional[float] = None
    clicks: Optional[int] = None
    impressions: Optional[int] = None
    ctr: Optional[float] = None
    model_config = {"from_attributes": True}

async def _verify_site(website_id: int, db: AsyncSession, owner_id: int) -> Website:
    from fastapi import HTTPException
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == owner_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    return site

@router.get("/live-stats")
async def keyword_live_stats(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(28),
):
    """Stats directement depuis GSC API — garanti identique à la Search Console."""
    from datetime import date, timedelta
    from app.models.user import UserAPICredential
    from app.core.crypto import decrypt_credentials
    from app.services.gsc_service import GSCService

    site = await _verify_site(website_id, db, effective_owner_id)

    if not site.gsc_cred_id or not site.gsc_property:
        raise HTTPException(status_code=400, detail="Credential GSC manquant")

    cred = (await db.execute(
        select(UserAPICredential).where(UserAPICredential.id == site.gsc_cred_id)
    )).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=400, detail="Credential introuvable")

    credentials_json = decrypt_credentials(cred.credentials_enc)
    gsc = GSCService(credentials_json=credentials_json, site_url=site.gsc_property)

    today = date.today()
    start_date = (today - timedelta(days=period - 1)).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")

    totals = gsc.get_period_totals(start_date=start_date, end_date=end_date)
    queries = gsc.get_top_queries_for_period(start_date=start_date, end_date=end_date)

    top_keywords = sorted(queries, key=lambda x: x["clicks"], reverse=True)[:10]

    # Position buckets
    buckets = {"top3": 0, "top10": 0, "top20": 0, "top50": 0, "plus50": 0}
    for q in queries:
        p = q["position"] or 999
        if p <= 3:    buckets["top3"] += 1
        elif p <= 10: buckets["top10"] += 1
        elif p <= 20: buckets["top20"] += 1
        elif p <= 50: buckets["top50"] += 1
        else:         buckets["plus50"] += 1

    # Daily trend from stored data (for the chart)
    latest_date_result = await db.execute(
        select(func.max(KeywordPosition.recorded_date)).where(KeywordPosition.website_id == website_id)
    )
    latest_date = latest_date_result.scalar()
    clicks_trend = []
    if latest_date:
        trend_start = latest_date - timedelta(days=min(period - 1, 29))
        trend_result = await db.execute(
            select(
                KeywordPosition.recorded_date,
                func.sum(KeywordPosition.clicks),
                func.sum(KeywordPosition.impressions),
                func.avg(KeywordPosition.position),
            )
            .where(
                KeywordPosition.website_id == website_id,
                KeywordPosition.recorded_date >= trend_start,
                KeywordPosition.recorded_date <= latest_date,
            )
            .group_by(KeywordPosition.recorded_date)
            .order_by(KeywordPosition.recorded_date)
        )
        clicks_trend = [
            {"date": str(r[0]), "clicks": int(r[1] or 0), "impressions": int(r[2] or 0),
             "avg_position": round(float(r[3]), 1) if r[3] else None}
            for r in trend_result.all()
        ]

    return {
        "total_keywords": len(queries),
        "total_clicks": totals["total_clicks"],
        "total_impressions": totals["total_impressions"],
        "avg_ctr": totals["avg_ctr"],
        "avg_position": totals["avg_position"],
        "latest_date": end_date,
        "period_days": period,
        "position_buckets": buckets,
        "top_keywords": top_keywords,
        "clicks_trend": clicks_trend,
        "source": "live_gsc",
    }


@router.get("/stats")
async def keyword_stats(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(28),
):
    await _verify_site(website_id, db, effective_owner_id)

    from sqlalchemy import text
    latest_date_result = await db.execute(
        select(func.max(KeywordPosition.recorded_date)).where(KeywordPosition.website_id == website_id)
    )
    latest_date = latest_date_result.scalar()
    if not latest_date:
        return {"total_keywords": 0, "avg_position": None, "total_clicks": 0, "total_impressions": 0, "avg_ctr": None, "position_buckets": {}, "top_keywords": [], "clicks_trend": []}

    period_start = latest_date - timedelta(days=period - 1)

    # Aggregate over full period — matches GSC default 28-day view
    # Position: impressions-weighted average (same as GSC)
    # CTR: total_clicks / total_impressions (same as GSC, not average of daily CTRs)
    agg_result = await db.execute(text("""
        SELECT
            kp.keyword_id,
            k.query,
            SUM(kp.clicks)      AS total_clicks,
            SUM(kp.impressions) AS total_impressions,
            CASE WHEN SUM(kp.impressions) > 0
                 THEN SUM(kp.position * kp.impressions) / SUM(kp.impressions)
                 ELSE AVG(kp.position)
            END AS avg_position
        FROM keyword_positions kp
        JOIN keywords k ON k.id = kp.keyword_id
        WHERE kp.website_id = :wid
          AND kp.recorded_date BETWEEN :period_start AND :latest_date
        GROUP BY kp.keyword_id, k.query
    """), {"wid": website_id, "period_start": period_start, "latest_date": latest_date})
    rows = agg_result.all()

    if not rows:
        return {"total_keywords": 0, "avg_position": None, "total_clicks": 0, "total_impressions": 0, "avg_ctr": None, "position_buckets": {}, "top_keywords": [], "clicks_trend": []}

    total_kw = len(rows)
    total_clicks = sum(int(r.total_clicks or 0) for r in rows)
    total_imp = sum(int(r.total_impressions or 0) for r in rows)

    # Aggregate position: impressions-weighted across all keywords
    weighted_pos_sum = sum(
        float(r.avg_position) * int(r.total_impressions or 0)
        for r in rows if r.avg_position and r.total_impressions
    )
    total_imp_for_pos = sum(int(r.total_impressions or 0) for r in rows if r.avg_position)
    avg_pos = round(weighted_pos_sum / total_imp_for_pos, 1) if total_imp_for_pos else None

    # CTR = total clicks / total impressions (matches GSC)
    avg_ctr = round(total_clicks / total_imp * 100, 2) if total_imp else None

    # Position buckets using per-keyword weighted avg position
    buckets = {"top3": 0, "top10": 0, "top20": 0, "top50": 0, "plus50": 0}
    for r in rows:
        p = float(r.avg_position) if r.avg_position else 999
        if p <= 3:    buckets["top3"] += 1
        elif p <= 10: buckets["top10"] += 1
        elif p <= 20: buckets["top20"] += 1
        elif p <= 50: buckets["top50"] += 1
        else:         buckets["plus50"] += 1

    # Top 10 by clicks over the period
    top_keywords = sorted(
        [{"query": r.query,
          "position": round(float(r.avg_position), 1) if r.avg_position else None,
          "clicks": int(r.total_clicks or 0),
          "impressions": int(r.total_impressions or 0),
          "ctr": round(int(r.total_clicks or 0) / int(r.total_impressions) * 100, 2) if r.total_impressions else None}
         for r in rows],
        key=lambda x: x["clicks"], reverse=True
    )[:10]

    # Daily trend last 30 days
    trend_start = latest_date - timedelta(days=29)
    trend_result = await db.execute(
        select(
            KeywordPosition.recorded_date,
            func.sum(KeywordPosition.clicks),
            func.sum(KeywordPosition.impressions),
            func.avg(KeywordPosition.position),
        )
        .where(
            KeywordPosition.website_id == website_id,
            KeywordPosition.recorded_date >= trend_start,
            KeywordPosition.recorded_date <= latest_date,
        )
        .group_by(KeywordPosition.recorded_date)
        .order_by(KeywordPosition.recorded_date)
    )
    clicks_trend = [
        {"date": str(r[0]), "clicks": int(r[1] or 0), "impressions": int(r[2] or 0),
         "avg_position": round(float(r[3]), 1) if r[3] else None}
        for r in trend_result.all()
    ]

    return {
        "total_keywords": total_kw,
        "avg_position": avg_pos,
        "total_clicks": total_clicks,
        "total_impressions": total_imp,
        "avg_ctr": avg_ctr,
        "latest_date": str(latest_date),
        "period_days": period,
        "position_buckets": buckets,
        "top_keywords": top_keywords,
        "clicks_trend": clicks_trend,
    }


@router.get("")
async def list_keywords(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    limit: int = Query(50, le=500),
    offset: int = Query(0),
    search: Optional[str] = Query(None),
    sort_by: str = Query("clicks"),
    position_max: Optional[float] = Query(None),
    period: int = Query(28),  # days for clicks/impressions/ctr aggregation
):
    await _verify_site(website_id, db, effective_owner_id)
    from sqlalchemy import text

    latest_date_result = await db.execute(
        select(func.max(KeywordPosition.recorded_date)).where(KeywordPosition.website_id == website_id)
    )
    latest_date = latest_date_result.scalar()
    if not latest_date:
        return {"data": [], "total": 0, "latest_date": None}

    period_start = latest_date - timedelta(days=period - 1)
    # "current week" = last 7 days, "prev week" = 8-14 days ago (for position change)
    week_start = latest_date - timedelta(days=6)
    prev_week_start = latest_date - timedelta(days=13)
    prev_week_end = latest_date - timedelta(days=7)

    extra_filters = ""
    params: dict = {
        "wid": website_id,
        "latest_date": latest_date,
        "period_start": period_start,
        "week_start": week_start,
        "prev_week_start": prev_week_start,
        "prev_week_end": prev_week_end,
        "limit": limit,
        "offset": offset,
    }
    if search:
        extra_filters += " AND k.query ILIKE :search"
        params["search"] = f"%{search}%"
    if position_max is not None:
        extra_filters += " AND pa.avg_position <= :pos_max"
        params["pos_max"] = position_max

    sort_map = {
        "clicks":       "total_clicks DESC NULLS LAST",
        "impressions":  "total_impressions DESC NULLS LAST",
        "position":     "avg_position ASC NULLS LAST",
        "ctr":          "avg_ctr DESC NULLS LAST",
    }
    order = sort_map.get(sort_by, "total_clicks DESC NULLS LAST")

    sql = text(f"""
        WITH
        -- Base: all keywords with data in the selected period (matches GSC period view)
        -- CTR = total_clicks / total_impressions (same as GSC)
        -- Position = impressions-weighted average over the period (same as GSC)
        period_agg AS (
            SELECT keyword_id,
                   SUM(clicks)      AS total_clicks,
                   SUM(impressions) AS total_impressions,
                   CASE WHEN SUM(impressions) > 0
                        THEN SUM(clicks)::float / SUM(impressions)
                        ELSE 0
                   END AS avg_ctr,
                   CASE WHEN SUM(impressions) > 0
                        THEN SUM(position * impressions) / SUM(impressions)
                        ELSE AVG(position)
                   END AS avg_position
            FROM keyword_positions
            WHERE website_id = :wid AND recorded_date BETWEEN :period_start AND :latest_date
            GROUP BY keyword_id
        ),
        -- Position change: current week vs previous week
        curr_pos AS (
            SELECT keyword_id, AVG(position) AS avg_pos
            FROM keyword_positions
            WHERE website_id = :wid AND recorded_date BETWEEN :week_start AND :latest_date
            GROUP BY keyword_id
        ),
        prev_pos AS (
            SELECT keyword_id, AVG(position) AS avg_pos
            FROM keyword_positions
            WHERE website_id = :wid AND recorded_date BETWEEN :prev_week_start AND :prev_week_end
            GROUP BY keyword_id
        )
        SELECT
            k.id, k.query, k.page,
            ROUND(pa.avg_position::numeric, 1)                            AS avg_position,
            ROUND((prev_pos.avg_pos - curr_pos.avg_pos)::numeric, 1)      AS position_change,
            COALESCE(pa.total_clicks, 0)                                  AS total_clicks,
            COALESCE(pa.total_impressions, 0)                             AS total_impressions,
            ROUND((COALESCE(pa.avg_ctr, 0) * 100)::numeric, 2)           AS avg_ctr
        FROM period_agg pa
        JOIN keywords k ON k.id = pa.keyword_id
        LEFT JOIN curr_pos  ON curr_pos.keyword_id  = pa.keyword_id
        LEFT JOIN prev_pos  ON prev_pos.keyword_id  = pa.keyword_id
        WHERE k.website_id = :wid {extra_filters}
        ORDER BY {order}
        LIMIT :limit OFFSET :offset
    """)

    count_sql = text(f"""
        WITH period_agg AS (
            SELECT keyword_id,
                   CASE WHEN SUM(impressions) > 0
                        THEN SUM(position * impressions) / SUM(impressions)
                        ELSE AVG(position)
                   END AS avg_position
            FROM keyword_positions
            WHERE website_id = :wid AND recorded_date BETWEEN :period_start AND :latest_date
            GROUP BY keyword_id
        )
        SELECT count(*)
        FROM period_agg pa
        JOIN keywords k ON k.id = pa.keyword_id
        WHERE k.website_id = :wid {extra_filters}
    """)

    count_params = {"wid": website_id, "period_start": period_start, "latest_date": latest_date}
    if search:
        count_params["search"] = params["search"]
    if position_max is not None:
        count_params["pos_max"] = position_max

    result = await db.execute(sql, params)
    count_result = await db.execute(count_sql, count_params)
    total = count_result.scalar() or 0

    out = [
        {
            "id": r.id,
            "query": r.query,
            "page": r.page,
            "position": float(r.avg_position) if r.avg_position else None,
            "position_change": float(r.position_change) if r.position_change else None,
            "clicks": int(r.total_clicks),
            "impressions": int(r.total_impressions),
            "ctr": float(r.avg_ctr) if r.avg_ctr else None,
        }
        for r in result.all()
    ]
    return {"data": out, "total": total, "latest_date": str(latest_date), "period_days": period}

@router.get("/{keyword_id}/history")
async def keyword_history(
    website_id: int,
    keyword_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    days: int = Query(30),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(KeywordPosition)
        .where(KeywordPosition.keyword_id == keyword_id, KeywordPosition.website_id == website_id)
        .order_by(KeywordPosition.recorded_date).limit(days)
    )
    rows = result.scalars().all()
    return [{"date": str(r.recorded_date), "position": float(r.position) if r.position else None, "clicks": r.clicks, "impressions": r.impressions} for r in rows]


# ── Monitored keywords ────────────────────────────────────────────────────────

class MonitorCreate(BaseModel):
    keyword_id: int
    channels: List[str] = ["email", "telegram"]
    notify_exit_top10: bool = True
    notify_enter_top10: bool = True
    notify_enter_top3: bool = True
    notify_rank1: bool = True

class MonitorUpdate(BaseModel):
    channels: Optional[List[str]] = None
    notify_exit_top10: Optional[bool] = None
    notify_enter_top10: Optional[bool] = None
    notify_enter_top3: Optional[bool] = None
    notify_rank1: Optional[bool] = None

class MonitorOut(BaseModel):
    id: int
    keyword_id: int
    query: str
    channels: List[str]
    notify_exit_top10: bool
    notify_enter_top10: bool
    notify_enter_top3: bool
    notify_rank1: bool
    last_known_position: Optional[float] = None
    model_config = {"from_attributes": True}


@router.get("/monitors")
async def list_monitors(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(MonitoredKeyword, Keyword.query)
        .join(Keyword, Keyword.id == MonitoredKeyword.keyword_id)
        .where(
            MonitoredKeyword.website_id == website_id,
            MonitoredKeyword.user_id == effective_owner_id,
        )
        .order_by(MonitoredKeyword.created_at.desc())
    )
    rows = result.all()
    return [
        {
            "id": m.MonitoredKeyword.id,
            "keyword_id": m.MonitoredKeyword.keyword_id,
            "query": m.query,
            "channels": m.MonitoredKeyword.channels or [],
            "notify_exit_top10": m.MonitoredKeyword.notify_exit_top10,
            "notify_enter_top10": m.MonitoredKeyword.notify_enter_top10,
            "notify_enter_top3": m.MonitoredKeyword.notify_enter_top3,
            "notify_rank1": m.MonitoredKeyword.notify_rank1,
            "last_known_position": float(m.MonitoredKeyword.last_known_position) if m.MonitoredKeyword.last_known_position else None,
        }
        for m in rows
    ]


@router.post("/monitors", status_code=201)
async def add_monitor(
    website_id: int,
    payload: MonitorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    # verify keyword belongs to this site
    kw_result = await db.execute(
        select(Keyword).where(Keyword.id == payload.keyword_id, Keyword.website_id == website_id)
    )
    kw = kw_result.scalar_one_or_none()
    if not kw:
        raise HTTPException(status_code=404, detail="Keyword not found")

    # upsert
    existing = await db.execute(
        select(MonitoredKeyword).where(
            MonitoredKeyword.user_id == effective_owner_id,
            MonitoredKeyword.keyword_id == payload.keyword_id,
        )
    )
    monitor = existing.scalar_one_or_none()
    if monitor:
        for k, v in payload.model_dump().items():
            setattr(monitor, k, v)
    else:
        monitor = MonitoredKeyword(
            user_id=effective_owner_id,
            website_id=website_id,
            **payload.model_dump(),
        )
        db.add(monitor)
    await db.flush()
    await db.refresh(monitor)
    return {"id": monitor.id, "keyword_id": monitor.keyword_id, "query": kw.query}


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
        select(MonitoredKeyword).where(
            MonitoredKeyword.id == monitor_id,
            MonitoredKeyword.user_id == effective_owner_id,
        )
    )
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(monitor, k, v)
    await db.flush()
    return {"ok": True}


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
        select(MonitoredKeyword).where(
            MonitoredKeyword.id == monitor_id,
            MonitoredKeyword.user_id == effective_owner_id,
        )
    )
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    await db.delete(monitor)
