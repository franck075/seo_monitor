"""Analytics overview — GSC-derived KPIs and monthly performance for a site."""
import calendar
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
