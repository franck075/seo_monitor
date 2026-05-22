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
from app.models.monitoring import SEOSnapshot, SitemapSnapshot, SitemapURL, HTTPCheck, CoreWebVital
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
    {
        "id": "low_ctr_high_impressions",
        "title": "Pages avec beaucoup d'impressions mais peu de clics",
        "summary": (
            "Vos pages apparaissent dans Google mais le titre n'attire pas les clics. "
            "Réécrire le <title> peut augmenter le CTR sans changer une ligne de contenu — "
            "et donc multiplier le trafic à positions équivalentes."
        ),
        "recommendations": [
            "Identifier la requête principale qui amène des impressions sur chaque page.",
            "Ouvrir la page et lire le <title> actuel.",
            "Comparer avec les titres des 3 premiers résultats Google pour cette requête.",
            "Réécrire le <title> avec : mot-clé principal en début + un chiffre, une date, ou un hook (ex : « 2026 », « guide complet », « en 5 minutes »).",
            "Republier la page puis demander une nouvelle indexation dans Google Search Console.",
        ],
    },
    {
        "id": "top_3_consolidate",
        "title": "Requêtes en position 1–3 à consolider",
        "summary": (
            "Vos meilleures positions sont des actifs précieux mais fragiles : un concurrent qui investit "
            "peut vous reprendre la place. Renforcez ces pages avec des liens internes depuis vos pages "
            "les plus visitées pour solidifier leur autorité."
        ),
        "recommendations": [
            "Identifier les requêtes qui se positionnent déjà en position 1, 2 ou 3.",
            "Repérer la page qui ressort pour chaque requête (colonne ci-dessous).",
            "Ouvrir vos pages les plus visitées (panneau « Pages sources ») et y ajouter des liens internes vers ces pages cibles.",
            "Utiliser comme ancre la requête ou une variation proche (sans sur-optimiser).",
            "Pour vérifier les liens internes existants, lancez sur Google : site:votredomaine.com \"ancre attendue\".",
        ],
    },
    {
        "id": "zero_traffic_pages",
        "title": "Pages indexées sans trafic — à optimiser ou supprimer",
        "summary": (
            "Ces pages apparaissent dans votre sitemap mais n'ont reçu aucune impression Google sur les "
            "3 derniers mois. Elles diluent votre budget de crawl et ne servent à rien : optimisez-les "
            "ou supprimez-les avec une redirection 301."
        ),
        "recommendations": [
            "Pour chaque page sans trafic : déterminer si elle a une intention de recherche réelle.",
            "Si oui → l'optimiser : titre, H1, contenu, maillage interne — viser un vrai mot-clé.",
            "Si non → la supprimer et mettre en place une redirection 301 vers la page la plus proche thématiquement.",
            "Mettre à jour le sitemap pour ne plus lister les pages supprimées.",
            "Demander la mise à jour de l'indexation dans Google Search Console.",
        ],
    },
    {
        "id": "mobile_vs_desktop_gap",
        "title": "Pages avec un écart de position important entre Mobile et Desktop",
        "summary": (
            "Si une page se classe bien sur un appareil et mal sur l'autre, c'est presque toujours un "
            "problème technique : performance mobile, indexation, ou rendu de la page. À corriger en "
            "priorité car Google utilise principalement l'index mobile-first."
        ),
        "recommendations": [
            "Pour chaque page avec un écart > 5 positions : identifier sur quel appareil la page est moins bien classée.",
            "Si la position mobile est plus mauvaise → tester la page sur PageSpeed Insights (mobile). Vérifier le temps de chargement, la lisibilité sans zoom, les zones cliquables.",
            "Corriger les problèmes techniques identifiés : LCP, CLS, INP, scripts bloquants, images non optimisées.",
            "Si la position desktop est plus mauvaise → vérifier que la version desktop est bien indexée (URL inspection dans Google Search Console).",
            "Republier puis demander l'indexation. Comparer les positions 2 semaines plus tard.",
        ],
    },
    {
        "id": "top_3_low_ctr",
        "title": "Requêtes Top 3 « presque cliquées » — problème de snippet",
        "summary": (
            "Vous êtes en position 1, 2 ou 3 mais les utilisateurs ne cliquent pas (CTR < 5%). "
            "Le problème n'est pas votre position, c'est votre <title> ou votre meta description qui "
            "ne donne pas envie de cliquer face aux concurrents."
        ),
        "recommendations": [
            "Tapez la requête dans Google et regardez les snippets des concurrents qui passent devant vous.",
            "Identifiez ce qui rend leur snippet plus cliquable : un chiffre, une promesse, un hook, une urgence.",
            "Réécrivez votre <title> avec un hook fort en début (ex : « 2026 », « guide complet », « à partir de 5M CFA »).",
            "Réécrivez la meta description pour matcher l'intention et inclure un appel à l'action.",
            "Republiez, demandez l'indexation et comparez le CTR 2 semaines plus tard.",
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


async def evaluate_low_ctr_high_impressions(
    site: Website,
    db: AsyncSession,
    period: int = 28,
    min_impressions: int = 100,
    max_ctr: float = 3.0,
    limit: int = 20,
) -> Dict[str, Any]:
    """QW #2: pages with high impressions but low CTR — title rewrite candidates."""
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site", "items": []}

    end = date.today()
    start = end - timedelta(days=period - 1)

    try:
        rows = gsc.get_query_page_pairs(str(start), str(end))
    except Exception as e:
        return {"has_data": False, "reason": str(e), "items": []}

    # Aggregate by page (weighted position)
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
        ctr = b["clicks"] / impressions * 100 if impressions else 0
        if ctr >= max_ctr:
            continue
        avg_pos = round(b["position_weighted_sum"] / impressions, 1) if impressions else 0
        top_query = max(b["queries"], key=lambda q: q["impressions"])
        candidates.append({
            "page": page,
            "position": avg_pos,
            "impressions": impressions,
            "clicks": b["clicks"],
            "ctr": round(ctr, 2),
            "top_query": {
                "query": top_query["query"],
                "impressions": top_query["impressions"],
                "clicks": top_query["clicks"],
                "position": top_query["position"],
                "ctr": top_query["ctr"],
            },
            "google_search_url": f"https://www.google.com/search?q={quote_plus(top_query['query'])}",
        })

    candidates.sort(key=lambda x: x["impressions"], reverse=True)
    candidates = candidates[:limit]

    # Pull current titles from SEO snapshots so the user sees what to rewrite
    snapshots = await _latest_snapshots_for_pages(db, site.id, [c["page"] for c in candidates])
    for c in candidates:
        snap = snapshots.get(c["page"])
        c["title"] = snap.title if snap else None
        c["meta_description"] = snap.meta_description if snap else None
        q = c["top_query"]["query"].lower()
        c["query_in_title"] = bool(snap and snap.title and q in snap.title.lower())

    return {
        "has_data": True,
        "period": period,
        "items": candidates,
        "total_candidates": len(candidates),
    }


async def evaluate_mobile_vs_desktop_gap(
    site: Website,
    db: AsyncSession,
    period: int = 28,
    min_position_gap: float = 5.0,
    min_impressions: int = 30,
    limit: int = 30,
) -> Dict[str, Any]:
    """QW #6: pages whose mobile vs desktop position differ significantly."""
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site", "items": []}

    end = date.today()
    start = end - timedelta(days=period - 1)

    try:
        rows = gsc.get_page_device_metrics(str(start), str(end))
    except Exception as e:
        return {"has_data": False, "reason": str(e), "items": []}

    # Group by page → { MOBILE: {...}, DESKTOP: {...}, TABLET: {...} }
    by_page: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        if not r["page"]:
            continue
        by_page.setdefault(r["page"], {})[r["device"]] = r

    candidates: List[Dict[str, Any]] = []
    for page, devices in by_page.items():
        m = devices.get("MOBILE")
        d = devices.get("DESKTOP")
        if not m or not d:
            continue
        if m["impressions"] < min_impressions and d["impressions"] < min_impressions:
            continue
        # gap > 0 → mobile is worse; gap < 0 → desktop is worse
        gap = m["position"] - d["position"]
        if abs(gap) < min_position_gap:
            continue
        candidates.append({
            "page": page,
            "mobile": m,
            "desktop": d,
            "gap": round(gap, 1),
            "worse_on": "mobile" if gap > 0 else "desktop",
            "total_impressions": m["impressions"] + d["impressions"],
            "pagespeed_url_mobile": f"https://pagespeed.web.dev/analysis?url={quote_plus(page)}&form_factor=mobile",
            "pagespeed_url_desktop": f"https://pagespeed.web.dev/analysis?url={quote_plus(page)}&form_factor=desktop",
        })

    candidates.sort(key=lambda x: (abs(x["gap"]), x["total_impressions"]), reverse=True)
    candidates = candidates[:limit]

    # Enrich with latest Core Web Vitals (one per strategy) for each candidate page
    if candidates:
        vital_rows = (await db.execute(
            select(CoreWebVital)
            .where(CoreWebVital.website_id == site.id, CoreWebVital.page_url.in_([c["page"] for c in candidates]))
            .order_by(CoreWebVital.page_url, CoreWebVital.strategy, desc(CoreWebVital.recorded_at))
        )).scalars().all()
        vitals_map: Dict[str, Dict[str, CoreWebVital]] = {}
        for v in vital_rows:
            vitals_map.setdefault(v.page_url, {}).setdefault(v.strategy, v)
        for c in candidates:
            v_by_strategy = vitals_map.get(c["page"], {})
            for strat in ("mobile", "desktop"):
                v = v_by_strategy.get(strat)
                c[f"vitals_{strat}"] = {
                    "performance_score": v.performance_score if v else None,
                    "lcp": float(v.lcp) if v and v.lcp is not None else None,
                    "cls": float(v.cls) if v and v.cls is not None else None,
                    "inp": float(v.inp) if v and v.inp is not None else None,
                } if v else None

    return {
        "has_data": True,
        "period": period,
        "items": candidates,
        "total_candidates": len(candidates),
    }


async def evaluate_top_3_low_ctr(
    site: Website,
    db: AsyncSession,
    period: int = 28,
    max_ctr: float = 5.0,
    min_impressions: int = 50,
    limit: int = 30,
) -> Dict[str, Any]:
    """QW #5: queries ranking position 1-3 but with surprisingly low CTR — snippet issue."""
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site", "items": []}

    end = date.today()
    start = end - timedelta(days=period - 1)

    try:
        rows = gsc.get_query_page_pairs(str(start), str(end))
    except Exception as e:
        return {"has_data": False, "reason": str(e), "items": []}

    items: List[Dict[str, Any]] = []
    for r in rows:
        if not r["page"] or not r["query"]:
            continue
        if r["impressions"] < min_impressions:
            continue
        if not (1.0 <= r["position"] <= 3.0):
            continue
        if r["ctr"] >= max_ctr:
            continue
        items.append({
            "page": r["page"],
            "query": r["query"],
            "position": r["position"],
            "impressions": r["impressions"],
            "clicks": r["clicks"],
            "ctr": r["ctr"],
            "google_search_url": f"https://www.google.com/search?q={quote_plus(r['query'])}",
        })

    items.sort(key=lambda x: x["impressions"], reverse=True)
    items = items[:limit]

    # Enrich with current title + meta description per page
    snapshots = await _latest_snapshots_for_pages(db, site.id, [it["page"] for it in items])
    for it in items:
        s = snapshots.get(it["page"])
        it["title"] = s.title if s else None
        it["meta_description"] = s.meta_description if s else None

    return {
        "has_data": True,
        "period": period,
        "items": items,
        "total_candidates": len(items),
    }


async def evaluate_zero_traffic_pages(
    site: Website,
    db: AsyncSession,
    period: int = 90,
    limit: int = 50,
) -> Dict[str, Any]:
    """QW #4: pages in the sitemap that received zero GSC impressions over the period."""
    # 1. Latest sitemap snapshot
    snap = (await db.execute(
        select(SitemapSnapshot)
        .where(SitemapSnapshot.website_id == site.id)
        .order_by(desc(SitemapSnapshot.recorded_at))
        .limit(1)
    )).scalar_one_or_none()
    if not snap:
        return {
            "has_data": False,
            "reason": "Aucun sitemap n'a encore été collecté pour ce site.",
            "items": [],
        }

    sitemap_urls: List[str] = (await db.execute(
        select(SitemapURL.url).where(SitemapURL.snapshot_id == snap.id)
    )).scalars().all()
    if not sitemap_urls:
        return {
            "has_data": False,
            "reason": "Le sitemap collecté ne contient aucune URL.",
            "items": [],
        }

    # 2. GSC pages with impressions over the period
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {
            "has_data": False,
            "reason": "GSC non configuré pour ce site.",
            "items": [],
        }
    end = date.today()
    start = end - timedelta(days=period - 1)
    try:
        gsc_pages = gsc.get_top_pages_for_period(str(start), str(end))
    except Exception as e:
        return {"has_data": False, "reason": str(e), "items": []}

    def normalize(u: str) -> str:
        return (u or "").rstrip("/").lower()

    pages_with_traffic = {normalize(p["page"]) for p in gsc_pages if p["impressions"] > 0}

    # 3. Diff
    zero_traffic_urls = [u for u in sitemap_urls if normalize(u) not in pages_with_traffic]
    total_zero = len(zero_traffic_urls)
    sample = zero_traffic_urls[:limit]

    # 4. Pull whatever context we have (title, HTTP status) for the sample
    snapshots = await _latest_snapshots_for_pages(db, site.id, sample)

    http_rows = (await db.execute(
        select(HTTPCheck)
        .where(HTTPCheck.website_id == site.id, HTTPCheck.page_url.in_(sample))
        .order_by(HTTPCheck.page_url, desc(HTTPCheck.checked_at))
    )).scalars().all()
    http_by_url: Dict[str, HTTPCheck] = {}
    for c in http_rows:
        http_by_url.setdefault(c.page_url, c)

    items: List[Dict[str, Any]] = []
    for url in sample:
        s = snapshots.get(url)
        h = http_by_url.get(url)
        items.append({
            "page": url,
            "title": s.title if s else None,
            "h1": s.h1 if s else None,
            "status_code": h.status_code if h else None,
            "last_seen_snapshot": s.recorded_at.isoformat() if s and s.recorded_at else None,
            "last_http_check": h.checked_at.isoformat() if h and h.checked_at else None,
        })

    return {
        "has_data": True,
        "period": period,
        "items": items,
        "total_candidates": total_zero,
        "sitemap_total_urls": len(sitemap_urls),
        "sitemap_recorded_at": snap.recorded_at.isoformat() if snap.recorded_at else None,
    }


async def evaluate_top_3_consolidate(
    site: Website,
    db: AsyncSession,
    period: int = 28,
    min_impressions: int = 30,
    limit: int = 30,
) -> Dict[str, Any]:
    """QW #3: queries already in position 1-3 — internal-linking consolidation candidates.

    Also returns the top 5 site pages by clicks, which are the best sources to add
    internal links from.
    """
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site", "items": [], "source_pages": []}

    end = date.today()
    start = end - timedelta(days=period - 1)

    try:
        pair_rows = gsc.get_query_page_pairs(str(start), str(end))
    except Exception as e:
        return {"has_data": False, "reason": str(e), "items": [], "source_pages": []}

    # Keep (page, query) rows whose position is in [1, 3]
    items: List[Dict[str, Any]] = []
    for r in pair_rows:
        if not r["page"] or not r["query"]:
            continue
        if r["impressions"] < min_impressions:
            continue
        if not (1.0 <= r["position"] <= 3.0):
            continue
        items.append({
            "page": r["page"],
            "query": r["query"],
            "position": r["position"],
            "impressions": r["impressions"],
            "clicks": r["clicks"],
            "ctr": r["ctr"],
            "google_search_url": f"https://www.google.com/search?q={quote_plus(r['query'])}",
        })

    items.sort(key=lambda x: x["impressions"], reverse=True)
    items = items[:limit]

    # Top source pages by clicks
    by_page: Dict[str, Dict[str, int]] = {}
    for r in pair_rows:
        if not r["page"]:
            continue
        bucket = by_page.setdefault(r["page"], {"clicks": 0, "impressions": 0})
        bucket["clicks"] += r["clicks"]
        bucket["impressions"] += r["impressions"]
    source_pages = sorted(
        [{"page": p, **m} for p, m in by_page.items() if m["clicks"] > 0],
        key=lambda x: x["clicks"],
        reverse=True,
    )[:5]

    return {
        "has_data": True,
        "period": period,
        "items": items,
        "total_candidates": len(items),
        "source_pages": source_pages,
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


@router.get("/low-ctr-high-impressions")
async def quick_win_low_ctr_high_impressions(
    website_id: int,
    period: int = Query(28, ge=7, le=365),
    min_impressions: int = Query(100, ge=1),
    max_ctr: float = Query(3.0, ge=0, le=100),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    return await evaluate_low_ctr_high_impressions(
        site, db, period=period, min_impressions=min_impressions, max_ctr=max_ctr, limit=limit
    )


@router.get("/top-3-consolidate")
async def quick_win_top_3_consolidate(
    website_id: int,
    period: int = Query(28, ge=7, le=365),
    min_impressions: int = Query(30, ge=1),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    return await evaluate_top_3_consolidate(
        site, db, period=period, min_impressions=min_impressions, limit=limit
    )


@router.get("/mobile-vs-desktop-gap")
async def quick_win_mobile_vs_desktop_gap(
    website_id: int,
    period: int = Query(28, ge=7, le=365),
    min_position_gap: float = Query(5.0, ge=0, le=100),
    min_impressions: int = Query(30, ge=1),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    return await evaluate_mobile_vs_desktop_gap(
        site, db,
        period=period,
        min_position_gap=min_position_gap,
        min_impressions=min_impressions,
        limit=limit,
    )


@router.get("/top-3-low-ctr")
async def quick_win_top_3_low_ctr(
    website_id: int,
    period: int = Query(28, ge=7, le=365),
    max_ctr: float = Query(5.0, ge=0, le=100),
    min_impressions: int = Query(50, ge=1),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    return await evaluate_top_3_low_ctr(
        site, db, period=period, max_ctr=max_ctr, min_impressions=min_impressions, limit=limit
    )


@router.get("/zero-traffic-pages")
async def quick_win_zero_traffic_pages(
    website_id: int,
    period: int = Query(90, ge=7, le=365),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _verify_site(website_id, db, effective_owner_id)
    return await evaluate_zero_traffic_pages(site, db, period=period, limit=limit)
