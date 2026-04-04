from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, timedelta
from app.db.session import get_db
from app.models.website import Website
from app.models.user import User, UserAPICredential
from app.deps import get_current_user, get_workspace_owner_id
from app.core.crypto import decrypt_credentials
from app.services.gsc_service import GSCService

router = APIRouter(prefix="/websites/{website_id}/insights", tags=["insights"])


async def _get_gsc(website_id: int, db: AsyncSession, owner_id: int) -> tuple[Website, GSCService]:
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == owner_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    if not site.gsc_cred_id or not site.gsc_property:
        raise HTTPException(status_code=400, detail="Credential GSC manquant")
    cred = (await db.execute(
        select(UserAPICredential).where(UserAPICredential.id == site.gsc_cred_id)
    )).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=400, detail="Credential introuvable")
    gsc = GSCService(credentials_json=decrypt_credentials(cred.credentials_enc), site_url=site.gsc_property)
    return site, gsc


def _dates(period: int):
    today = date.today()
    curr_end = today
    curr_start = today - timedelta(days=period - 1)
    prev_end = curr_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period - 1)
    return (
        curr_start.strftime("%Y-%m-%d"), curr_end.strftime("%Y-%m-%d"),
        prev_start.strftime("%Y-%m-%d"), prev_end.strftime("%Y-%m-%d"),
    )


@router.get("/position-drops")
async def position_drops(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(28),
):
    """Mots-clés qui ont le plus perdu en position vs la période précédente (données GSC live)."""
    _, gsc = await _get_gsc(website_id, db, effective_owner_id)
    curr_start, curr_end, prev_start, prev_end = _dates(period)

    curr_rows = gsc.get_top_queries_for_period(curr_start, curr_end)
    prev_rows = gsc.get_top_queries_for_period(prev_start, prev_end)

    prev_map = {r["query"]: r for r in prev_rows}
    results = []
    for r in curr_rows:
        q = r["query"]
        if q not in prev_map:
            continue
        p = prev_map[q]
        delta = r["position"] - p["position"]
        if delta > 1.5:
            results.append({
                "query": q,
                "position_current": round(r["position"], 1),
                "position_previous": round(p["position"], 1),
                "delta": round(delta, 1),
                "impressions": r["impressions"],
                "clicks": r["clicks"],
                "ctr": r["ctr"],
            })

    results.sort(key=lambda x: x["delta"], reverse=True)
    return results[:25]


@router.get("/quick-wins")
async def quick_wins(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(28),
):
    """Mots-clés en positions 2–10 à fort potentiel (données GSC live)."""
    _, gsc = await _get_gsc(website_id, db, effective_owner_id)
    curr_start, curr_end, _, _ = _dates(period)
    rows = gsc.get_top_queries_for_period(curr_start, curr_end)

    results = [
        {
            "query": r["query"],
            "avg_position": round(r["position"], 1),
            "total_impressions": r["impressions"],
            "total_clicks": r["clicks"],
            "avg_ctr": r["ctr"],
        }
        for r in rows
        if 2 <= r["position"] <= 10 and r["impressions"] >= 30
    ]
    results.sort(key=lambda x: x["total_impressions"], reverse=True)
    return results[:25]


@router.get("/ctr-opportunities")
async def ctr_opportunities(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(28),
):
    """Bien positionnés mais CTR sous la moyenne — Title/Meta à retravailler (données GSC live)."""
    _, gsc = await _get_gsc(website_id, db, effective_owner_id)
    curr_start, curr_end, _, _ = _dates(period)
    rows = gsc.get_top_queries_for_period(curr_start, curr_end)

    results = []
    for r in rows:
        if r["position"] <= 6 and r["ctr"] < 4.0 and r["impressions"] >= 50:
            # Estimate expected CTR based on position
            expected = 15.0 if r["position"] <= 1 else (8.0 if r["position"] <= 3 else (4.0 if r["position"] <= 6 else 2.0))
            lost = round(r["impressions"] * (expected - r["ctr"]) / 100)
            results.append({
                "query": r["query"],
                "avg_position": round(r["position"], 1),
                "avg_ctr": r["ctr"],
                "total_impressions": r["impressions"],
                "total_clicks": r["clicks"],
                "lost_clicks_estimate": max(0, lost),
            })
    results.sort(key=lambda x: x["total_impressions"], reverse=True)
    return results[:25]


@router.get("/ghost-keywords")
async def ghost_keywords(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(28),
):
    """Impressions sans aucun clic — visibilité sans trafic (données GSC live)."""
    _, gsc = await _get_gsc(website_id, db, effective_owner_id)
    curr_start, curr_end, _, _ = _dates(period)
    rows = gsc.get_top_queries_for_period(curr_start, curr_end)

    results = [
        {
            "query": r["query"],
            "avg_position": round(r["position"], 1),
            "total_impressions": r["impressions"],
            "total_clicks": r["clicks"],
        }
        for r in rows
        if r["clicks"] == 0 and r["impressions"] >= 20
    ]
    results.sort(key=lambda x: x["total_impressions"], reverse=True)
    return results[:25]


@router.get("/summary")
async def insights_summary(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    period: int = Query(28),
):
    """Compteurs pour les 4 KPI cards (données GSC live)."""
    _, gsc = await _get_gsc(website_id, db, effective_owner_id)
    curr_start, curr_end, prev_start, prev_end = _dates(period)

    curr_rows = gsc.get_top_queries_for_period(curr_start, curr_end)
    prev_rows = gsc.get_top_queries_for_period(prev_start, prev_end)
    prev_map = {r["query"]: r for r in prev_rows}

    drops = sum(
        1 for r in curr_rows
        if r["query"] in prev_map and (r["position"] - prev_map[r["query"]]["position"]) > 1.5
    )
    wins = sum(1 for r in curr_rows if 2 <= r["position"] <= 10 and r["impressions"] >= 30)
    ctrs = sum(1 for r in curr_rows if r["position"] <= 6 and r["ctr"] < 4.0 and r["impressions"] >= 50)
    ghosts = sum(1 for r in curr_rows if r["clicks"] == 0 and r["impressions"] >= 20)

    return {
        "position_drops": drops,
        "quick_wins": wins,
        "ctr_opportunities": ctrs,
        "ghost_keywords": ghosts,
    }
