"""Analytics overview — GSC-derived KPIs and monthly performance for a site."""
import calendar
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pydantic import BaseModel

from app.db.session import get_db
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User, UserAPICredential
from app.models.website import Website
from app.models.keyword import KeywordCluster
from app.core.crypto import decrypt_credentials

router = APIRouter(prefix="/websites/{website_id}/analytics", tags=["analytics"])

FR_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
             "juil.", "août", "sept.", "oct.", "nov.", "déc."]


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


def _kpi(curr: int, prev: int) -> Dict[str, Any]:
    return {"current": curr, "previous": prev, "change_pct": _pct(curr, prev)}


@router.get("/overview")
async def analytics_overview(
    website_id: int,
    period: int = Query(28, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """4 KPI cards (with period-over-period comparison) + monthly performance chart."""
    site = await _verify_site(website_id, db, effective_owner_id)
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site"}

    curr_end = date.today()
    curr_start = curr_end - timedelta(days=period - 1)
    prev_end = curr_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period - 1)

    try:
        curr_queries = gsc.get_top_queries_for_period(str(curr_start), str(curr_end))
        prev_queries = gsc.get_top_queries_for_period(str(prev_start), str(prev_end))
        curr_pages = gsc.get_top_pages_for_period(str(curr_start), str(curr_end))
        prev_pages = gsc.get_top_pages_for_period(str(prev_start), str(prev_end))
    except Exception as e:
        return {"has_data": False, "reason": str(e)}

    def count_with_clicks(rows): return sum(1 for r in rows if r["clicks"] > 0)
    def count_visible(rows): return sum(1 for r in rows if r["impressions"] > 0)

    kpis = {
        "keywords_with_clicks": _kpi(count_with_clicks(curr_queries), count_with_clicks(prev_queries)),
        "keywords_visible": _kpi(count_visible(curr_queries), count_visible(prev_queries)),
        "pages_with_clicks": _kpi(count_with_clicks(curr_pages), count_with_clicks(prev_pages)),
        "pages_visible": _kpi(count_visible(curr_pages), count_visible(prev_pages)),
    }

    # ── Monthly performance (last 16 months incl. current) ──
    # GSC keeps ~16 months of history. Pull daily totals once, aggregate by month.
    monthly_start = (curr_end.replace(day=1) - timedelta(days=1))  # last day of prev month
    # Go back ~15 full months from the first of the current month
    first_of_current = curr_end.replace(day=1)
    monthly_window_start = first_of_current
    for _ in range(15):
        monthly_window_start = (monthly_window_start - timedelta(days=1)).replace(day=1)

    monthly: List[Dict[str, Any]] = []
    try:
        daily = gsc.get_totals_by_date(str(monthly_window_start), str(curr_end))
        agg: Dict[str, Dict[str, int]] = {}
        for d in daily:
            ym = d["date"][:7]  # YYYY-MM
            bucket = agg.setdefault(ym, {"clicks": 0, "impressions": 0})
            bucket["clicks"] += d["clicks"]
            bucket["impressions"] += d["impressions"]

        # Build an ordered month list from window_start to current month
        cursor = monthly_window_start
        while cursor <= first_of_current:
            ym = cursor.strftime("%Y-%m")
            data = agg.get(ym, {"clicks": 0, "impressions": 0})
            label = f"{FR_MONTHS[cursor.month - 1]} {str(cursor.year)[2:]}"
            is_current = (cursor.year == curr_end.year and cursor.month == curr_end.month)

            entry = {
                "month": ym,
                "label": label,
                "clicks": data["clicks"],
                "impressions": data["impressions"],
                "is_projection": False,
            }
            if is_current:
                # Project full-month totals based on days elapsed
                days_in_month = calendar.monthrange(cursor.year, cursor.month)[1]
                days_elapsed = curr_end.day
                if days_elapsed > 0:
                    factor = days_in_month / days_elapsed
                    entry["clicks_actual"] = data["clicks"]
                    entry["impressions_actual"] = data["impressions"]
                    entry["clicks_projected"] = round(data["clicks"] * factor)
                    entry["impressions_projected"] = round(data["impressions"] * factor)
                    entry["is_projection"] = True
            monthly.append(entry)

            # advance to first of next month
            if cursor.month == 12:
                cursor = cursor.replace(year=cursor.year + 1, month=1)
            else:
                cursor = cursor.replace(month=cursor.month + 1)
    except Exception:
        monthly = []

    return {
        "has_data": True,
        "period": period,
        "current_range": {"start": str(curr_start), "end": str(curr_end)},
        "previous_range": {"start": str(prev_start), "end": str(prev_end)},
        "kpis": kpis,
        "monthly": monthly,
    }


# ISO-3166 alpha-3 → French country name (only the codes GSC commonly returns;
# unknown codes fall back to the raw code).
COUNTRY_FR = {
    "FRA": "France", "BEL": "Belgique", "CAN": "Canada", "MAR": "Maroc",
    "REU": "La Réunion", "DZA": "Algérie", "MDG": "Madagascar", "BEN": "Bénin",
    "ESP": "Espagne", "CHE": "Suisse", "USA": "États-Unis", "GBR": "Royaume-Uni",
    "DEU": "Allemagne", "ITA": "Italie", "PRT": "Portugal", "NLD": "Pays-Bas",
    "CIV": "Côte d'Ivoire", "SEN": "Sénégal", "CMR": "Cameroun", "TUN": "Tunisie",
    "TGO": "Togo", "GAB": "Gabon", "COD": "RD Congo", "COG": "Congo",
    "BFA": "Burkina Faso", "MLI": "Mali", "NER": "Niger", "GIN": "Guinée",
    "LUX": "Luxembourg", "BRA": "Brésil", "IND": "Inde", "CHN": "Chine",
}

WEEKDAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
DEVICE_FR = {"DESKTOP": "Desktop", "MOBILE": "Mobile", "TABLET": "Tablet"}


@router.get("/breakdown")
async def analytics_breakdown(
    website_id: int,
    period: int = Query(90, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Clicks by weekday, top countries (with change), and device split + evolution."""
    site = await _verify_site(website_id, db, effective_owner_id)
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site"}

    curr_end = date.today()
    curr_start = curr_end - timedelta(days=period - 1)
    prev_end = curr_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period - 1)

    try:
        daily = gsc.get_totals_by_date(str(curr_start), str(curr_end))
        countries_curr = gsc.get_totals_by_country(str(curr_start), str(curr_end))
        countries_prev = gsc.get_totals_by_country(str(prev_start), str(prev_end))
        device_daily = gsc.get_device_metrics_by_date(str(curr_start), str(curr_end))
    except Exception as e:
        return {"has_data": False, "reason": str(e)}

    # ── Weekday ──
    weekday_clicks = [0] * 7
    weekday_days = [0] * 7
    for d in daily:
        try:
            y, m, dd = (int(x) for x in d["date"].split("-"))
            wd = date(y, m, dd).weekday()
        except Exception:
            continue
        weekday_clicks[wd] += d["clicks"]
        weekday_days[wd] += 1
    weekday = []
    for i in range(7):
        avg = round(weekday_clicks[i] / weekday_days[i]) if weekday_days[i] else 0
        weekday.append({"day": WEEKDAYS_FR[i], "clicks": weekday_clicks[i], "avg_clicks": avg})
    best_day = max(weekday, key=lambda x: x["avg_clicks"]) if weekday else None

    # ── Countries (top 10, current vs previous) ──
    prev_by_country = {c["country"]: c for c in countries_prev}
    countries = []
    for c in sorted(countries_curr, key=lambda x: x["clicks"], reverse=True)[:10]:
        prev_clicks = prev_by_country.get(c["country"], {}).get("clicks", 0)
        countries.append({
            "country": c["country"],
            "country_label": COUNTRY_FR.get(c["country"], c["country"]),
            "clicks": c["clicks"],
            "impressions": c["impressions"],
            "change_pct": _pct(c["clicks"], prev_clicks),
        })
    max_country_clicks = max((c["clicks"] for c in countries), default=0)
    for c in countries:
        c["bar_pct"] = round(c["clicks"] / max_country_clicks * 100) if max_country_clicks else 0

    # ── Devices (totals + daily evolution) ──
    device_totals: Dict[str, int] = {"DESKTOP": 0, "MOBILE": 0, "TABLET": 0}
    evolution_map: Dict[str, Dict[str, int]] = {}
    for r in device_daily:
        dev = r["device"]
        if dev in device_totals:
            device_totals[dev] += r["clicks"]
        bucket = evolution_map.setdefault(r["date"], {"DESKTOP": 0, "MOBILE": 0, "TABLET": 0})
        if dev in bucket:
            bucket[dev] += r["clicks"]
    devices = [
        {"device": DEVICE_FR[k], "key": k.lower(), "clicks": v}
        for k, v in device_totals.items()
    ]
    device_evolution = [
        {
            "date": dt,
            "desktop": evolution_map[dt]["DESKTOP"],
            "mobile": evolution_map[dt]["MOBILE"],
            "tablet": evolution_map[dt]["TABLET"],
        }
        for dt in sorted(evolution_map.keys())
    ]

    return {
        "has_data": True,
        "period": period,
        "weekday": weekday,
        "best_day": best_day,
        "countries": countries,
        "devices": devices,
        "device_evolution": device_evolution,
    }


def _default_brand_terms(site: Website) -> List[str]:
    """Derive likely brand terms from the domain label and display name."""
    terms = set()
    if site.domain:
        # pixlstudio.africa -> "pixlstudio"
        label = site.domain.split("//")[-1].split("/")[0]
        label = label[4:] if label.startswith("www.") else label
        root = label.split(".")[0]
        if root:
            terms.add(root.lower())
    if site.display_name:
        terms.add(site.display_name.strip().lower())
    return [t for t in terms if len(t) >= 3]


def _is_branded(query: str, brand_terms: List[str]) -> bool:
    q = query.lower()
    return any(bt in q for bt in brand_terms)


def _iso_week(d: date) -> str:
    iso = d.isocalendar()
    return f"{iso[0]}-S{iso[1]:02d}"


@router.get("/branded")
async def analytics_branded(
    website_id: int,
    period: int = Query(180, ge=7, le=365),
    brand_terms: Optional[str] = Query(None, description="Comma-separated brand terms; overrides auto-detection"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Branded vs non-branded split (totals + weekly evolution)."""
    site = await _verify_site(website_id, db, effective_owner_id)
    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site"}

    if brand_terms:
        terms = [t.strip().lower() for t in brand_terms.split(",") if t.strip()]
    else:
        terms = _default_brand_terms(site)
    if not terms:
        return {"has_data": False, "reason": "Impossible de déterminer un terme de marque pour ce site."}

    curr_end = date.today()
    curr_start = curr_end - timedelta(days=period - 1)

    try:
        queries = gsc.get_top_queries_for_period(str(curr_start), str(curr_end))
        daily = gsc.get_keyword_positions_daily(str(curr_start), str(curr_end))
    except Exception as e:
        return {"has_data": False, "reason": str(e)}

    # ── Totals split ──
    def empty(): return {"clicks": 0, "impressions": 0, "queries": 0}
    branded, non_branded = empty(), empty()
    for q in queries:
        bucket = branded if _is_branded(q["query"], terms) else non_branded
        bucket["clicks"] += q["clicks"]
        bucket["impressions"] += q["impressions"]
        bucket["queries"] += 1

    def finalize(b):
        return {
            "clicks": b["clicks"],
            "impressions": b["impressions"],
            "queries": b["queries"],
            "ctr": round(b["clicks"] / b["impressions"] * 100, 2) if b["impressions"] else 0,
        }

    total_clicks = branded["clicks"] + non_branded["clicks"]
    branded_pct = round(branded["clicks"] / total_clicks * 100, 1) if total_clicks else 0

    # ── Weekly evolution ──
    week_map: Dict[str, Dict[str, int]] = {}
    for r in daily:
        try:
            y, m, dd = (int(x) for x in r["date"].split("-"))
            wk = _iso_week(date(y, m, dd))
        except Exception:
            continue
        bucket = week_map.setdefault(wk, {"branded": 0, "non_branded": 0})
        if _is_branded(r["query"], terms):
            bucket["branded"] += r["clicks"]
        else:
            bucket["non_branded"] += r["clicks"]
    evolution = [
        {"week": wk, "branded": week_map[wk]["branded"], "non_branded": week_map[wk]["non_branded"]}
        for wk in sorted(week_map.keys())
    ]

    return {
        "has_data": True,
        "period": period,
        "brand_terms": terms,
        "total_clicks": total_clicks,
        "branded_pct": branded_pct,
        "non_branded_pct": round(100 - branded_pct, 1) if total_clicks else 0,
        "branded": finalize(branded),
        "non_branded": finalize(non_branded),
        "evolution": evolution,
    }


# ── Keyword clusters (rule-based) ─────────────────────────────────────────────

class ClusterIn(BaseModel):
    name: str
    color: str = "#3b82f6"
    terms: List[str] = []
    is_brand: bool = False
    position: int = 0


def _cluster_out(c: KeywordCluster) -> Dict[str, Any]:
    return {
        "id": c.id,
        "name": c.name,
        "color": c.color,
        "terms": c.terms or [],
        "is_brand": c.is_brand,
        "position": c.position,
    }


@router.get("/clusters/definitions")
async def list_clusters(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    rows = (await db.execute(
        select(KeywordCluster)
        .where(KeywordCluster.website_id == website_id)
        .order_by(KeywordCluster.position, KeywordCluster.id)
    )).scalars().all()
    return {"clusters": [_cluster_out(c) for c in rows]}


@router.post("/clusters/definitions")
async def create_cluster(
    website_id: int,
    payload: ClusterIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    cluster = KeywordCluster(
        website_id=website_id,
        name=payload.name,
        color=payload.color,
        terms=[t.strip().lower() for t in payload.terms if t.strip()],
        is_brand=payload.is_brand,
        position=payload.position,
    )
    db.add(cluster)
    await db.commit()
    await db.refresh(cluster)
    return _cluster_out(cluster)


@router.put("/clusters/definitions/{cluster_id}")
async def update_cluster(
    website_id: int,
    cluster_id: int,
    payload: ClusterIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    cluster = (await db.execute(
        select(KeywordCluster).where(
            KeywordCluster.id == cluster_id, KeywordCluster.website_id == website_id
        )
    )).scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster introuvable")
    cluster.name = payload.name
    cluster.color = payload.color
    cluster.terms = [t.strip().lower() for t in payload.terms if t.strip()]
    cluster.is_brand = payload.is_brand
    cluster.position = payload.position
    await db.commit()
    await db.refresh(cluster)
    return _cluster_out(cluster)


@router.delete("/clusters/definitions/{cluster_id}")
async def delete_cluster(
    website_id: int,
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    cluster = (await db.execute(
        select(KeywordCluster).where(
            KeywordCluster.id == cluster_id, KeywordCluster.website_id == website_id
        )
    )).scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster introuvable")
    await db.delete(cluster)
    await db.commit()
    return {"deleted": True}


@router.get("/clusters")
async def analytics_clusters(
    website_id: int,
    period: int = Query(28, ge=7, le=365),
    uncategorized_limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Aggregate GSC queries into the site's rule-based clusters (current vs previous)."""
    site = await _verify_site(website_id, db, effective_owner_id)

    clusters = (await db.execute(
        select(KeywordCluster)
        .where(KeywordCluster.website_id == website_id)
        .order_by(KeywordCluster.position, KeywordCluster.id)
    )).scalars().all()

    gsc = await _gsc_for_site(site, db)
    if not gsc:
        return {"has_data": False, "reason": "GSC non configuré pour ce site", "clusters": []}

    curr_end = date.today()
    curr_start = curr_end - timedelta(days=period - 1)
    prev_end = curr_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period - 1)

    try:
        curr_q = gsc.get_top_queries_for_period(str(curr_start), str(curr_end))
        prev_q = gsc.get_top_queries_for_period(str(prev_start), str(prev_end))
    except Exception as e:
        return {"has_data": False, "reason": str(e), "clusters": []}

    # Pre-lowercase cluster terms
    cluster_terms = [(c, [t.lower() for t in (c.terms or [])]) for c in clusters]

    def classify(query: str) -> Optional[int]:
        q = query.lower()
        for c, terms in cluster_terms:
            if any(t in q for t in terms):
                return c.id
        return None

    def aggregate(queries):
        agg: Dict[Optional[int], Dict[str, int]] = {}
        for q in queries:
            cid = classify(q["query"])
            bucket = agg.setdefault(cid, {"clicks": 0, "impressions": 0, "keywords": 0})
            bucket["clicks"] += q["clicks"]
            bucket["impressions"] += q["impressions"]
            bucket["keywords"] += 1
        return agg

    curr_agg = aggregate(curr_q)
    prev_agg = aggregate(prev_q)

    result_clusters = []
    for c in clusters:
        cur = curr_agg.get(c.id, {"clicks": 0, "impressions": 0, "keywords": 0})
        prv = prev_agg.get(c.id, {"clicks": 0, "impressions": 0, "keywords": 0})
        result_clusters.append({
            **_cluster_out(c),
            "clicks": cur["clicks"],
            "impressions": cur["impressions"],
            "keywords": cur["keywords"],
            "clicks_change_pct": _pct(cur["clicks"], prv["clicks"]),
            "impressions_change_pct": _pct(cur["impressions"], prv["impressions"]),
        })
    result_clusters.sort(key=lambda x: x["clicks"], reverse=True)

    # Uncategorized
    uncategorized_cur = curr_agg.get(None, {"clicks": 0, "impressions": 0, "keywords": 0})
    uncategorized_queries = sorted(
        [q for q in curr_q if classify(q["query"]) is None],
        key=lambda x: x["clicks"], reverse=True,
    )[:uncategorized_limit]

    return {
        "has_data": True,
        "period": period,
        "clusters": result_clusters,
        "uncategorized": {
            "clicks": uncategorized_cur["clicks"],
            "impressions": uncategorized_cur["impressions"],
            "keywords": uncategorized_cur["keywords"],
            "queries": uncategorized_queries,
        },
    }
