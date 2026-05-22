"""Quick Wins — actionable SEO opportunities derived from GSC data.

Each Quick Win has its own evaluator function that returns a list of
recommended targets (pages/keywords) with the data the user needs to act.
"""
from datetime import date, timedelta
from typing import Optional, List, Dict, Any
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.db.session import get_db
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User, UserAPICredential
from app.models.website import Website
from app.models.monitoring import SEOSnapshot
from app.core.crypto import decrypt_credentials

router = APIRouter(prefix="/websites/{website_id}/quick-wins", tags=["quick-wins"])


# ── Catalog of Quick Wins shown on the UI ─────────────────────────────────────

QUICK_WINS_CATALOG = [
    {
        "id": "position_4_15",
        "title": "Pages en position 4–15 — opportunités les plus rentables",
        "summary": (
            "Vos pages qui se classent entre la position 4 et 15 sont à portée du Top 3 de Google. "
            "Un petit gain de pertinence sur ces pages peut multiplier leur trafic par 3 à 5."
        ),
        "recommendations": [
            "Identifier la requête principale (celle avec le plus d'impressions) pour chaque page.",
            "Vérifier que cette requête apparaît dans le <title> et le <H1> de la page.",
            "Analyser les 3 premiers résultats Google sur cette requête : quels angles, structures, et contenus ils couvrent.",
            "Ajouter à votre page le contenu manquant identifié dans l'analyse.",
            "Republier la page puis demander une nouvelle indexation dans Google Search Console.",
        ],
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

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


async def _latest_snapshots_for_pages(db: AsyncSession, website_id: int, page_urls: List[str]) -> Dict[str, SEOSnapshot]:
    """Return the most recent SEOSnapshot per URL, mapped by URL."""
    if not page_urls:
        return {}
    result = await db.execute(
        select(SEOSnapshot)
        .where(SEOSnapshot.website_id == website_id, SEOSnapshot.page_url.in_(page_urls))
        .order_by(SEOSnapshot.page_url, desc(SEOSnapshot.recorded_at))
    )
    out: Dict[str, SEOSnapshot] = {}
    for snap in result.scalars():
        out.setdefault(snap.page_url, snap)
    return out


# ── Evaluators ────────────────────────────────────────────────────────────────

async def evaluate_position_4_15(
    site: Website,
    db: AsyncSession,
    period: int = 28,
    min_impressions: int = 50,
    limit: int = 20,
) -> Dict[str, Any]:
    """QW #1: pages with weighted avg position between 4 and 15."""
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site", "items": []}

    end = date.today()
    start = end - timedelta(days=period - 1)

    try:
        rows = gsc.get_query_page_pairs(str(start), str(end))
    except Exception as e:
        return {"has_data": False, "reason": str(e), "items": []}

    # Aggregate by page (weighted position by impressions)
    by_page: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        page = r["page"]
        if not page:
            continue
        bucket = by_page.setdefault(page, {
            "clicks": 0,
            "impressions": 0,
            "position_weighted_sum": 0.0,
            "queries": [],
        })
        bucket["clicks"] += r["clicks"]
        bucket["impressions"] += r["impressions"]
        bucket["position_weighted_sum"] += r["position"] * max(r["impressions"], 1)
        bucket["queries"].append(r)

    candidates: List[Dict[str, Any]] = []
    for page, b in by_page.items():
        impressions = b["impressions"]
        if impressions < min_impressions:
            continue
        avg_pos = round(b["position_weighted_sum"] / impressions, 1) if impressions else 0
        if not (4.0 <= avg_pos <= 15.0):
            continue
        top_query = max(b["queries"], key=lambda q: q["impressions"])
        candidates.append({
            "page": page,
            "position": avg_pos,
            "impressions": impressions,
            "clicks": b["clicks"],
            "ctr": round(b["clicks"] / impressions * 100, 2) if impressions else 0,
            "top_query": {
                "query": top_query["query"],
                "impressions": top_query["impressions"],
                "clicks": top_query["clicks"],
                "position": top_query["position"],
            },
            "google_search_url": f"https://www.google.com/search?q={quote_plus(top_query['query'])}",
        })

    candidates.sort(key=lambda x: x["impressions"], reverse=True)
    candidates = candidates[:limit]

    # Cross-reference with SEO snapshots: is the top query in <title> and <H1>?
    snapshots = await _latest_snapshots_for_pages(db, site.id, [c["page"] for c in candidates])
    for c in candidates:
        snap = snapshots.get(c["page"])
        q = c["top_query"]["query"].lower()
        c["title"] = snap.title if snap else None
        c["h1"] = snap.h1 if snap else None
        c["query_in_title"] = bool(snap and snap.title and q in snap.title.lower())
        c["query_in_h1"] = bool(snap and snap.h1 and q in snap.h1.lower())

    return {
        "has_data": True,
        "period": period,
        "items": candidates,
        "total_candidates": len(candidates),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_quick_wins(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """List all Quick Wins available for this site, with their metadata (no
    computation yet — the UI calls the per-QW endpoint on demand)."""
    await _verify_site(website_id, db, effective_owner_id)
    return {"quick_wins": QUICK_WINS_CATALOG}


@router.get("/position-4-15")
async def quick_win_position_4_15(
    website_id: int,
    period: int = Query(28, ge=7, le=365),
    min_impressions: int = Query(50, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    return await evaluate_position_4_15(site, db, period=period, min_impressions=min_impressions, limit=limit)
