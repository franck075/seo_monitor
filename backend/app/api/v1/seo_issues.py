from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, text
from datetime import datetime, timezone, date, timedelta
from typing import Optional
from app.db.session import get_db
from app.models.website import Website
from app.models.seo_issues import SEOIssue, SEOIssueAlertConfig
from app.models.user import User
from app.deps import get_current_user, get_workspace_owner_id, require_plan

router = APIRouter(prefix="/websites/{website_id}/seo-issues", tags=["seo-issues"])

ALL_ISSUE_TYPES = [
    "cannibalization", "position_drop", "redirect_chain", "aging_content",
    "no_impressions", "canonical_change", "robots_change", "x_robots_noindex",
    "redirect_broken", "h1_change", "duplicate_title", "duplicate_meta",
]

ISSUE_LABELS = {
    "cannibalization": "Cannibalisation",
    "position_drop": "Chutes de positions",
    "redirect_chain": "Chaînes de redirections",
    "aging_content": "Contenu vieillissant",
    "no_impressions": "Déindex silencieux",
    "canonical_change": "Changement canonique",
    "robots_change": "robots.txt modifié",
    "x_robots_noindex": "X-Robots-Tag noindex",
    "redirect_broken": "Redirection cassée",
    "h1_change": "Changement H1",
    "duplicate_title": "Titres en doublon",
    "duplicate_meta": "Meta descriptions en doublon",
}


async def _check_ownership(website_id: int, db: AsyncSession, current_user: User, owner_id: int) -> Website:
    if current_user.id == owner_id:
        require_plan(current_user, "pro")
    site = (await db.execute(
        select(Website).where(Website.id == website_id, Website.user_id == owner_id)
    )).scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    return site


@router.get("")
async def list_issues(
    website_id: int,
    issue_type: Optional[str] = Query(None),
    resolved: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    q = select(SEOIssue).where(SEOIssue.website_id == website_id, SEOIssue.is_resolved == resolved)
    if issue_type:
        q = q.where(SEOIssue.issue_type == issue_type)
    q = q.order_by(SEOIssue.detected_at.desc()).limit(500)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": r.id, "issue_type": r.issue_type, "severity": r.severity,
            "url": r.url, "detail": r.detail, "data": r.data,
            "detected_at": r.detected_at, "is_resolved": r.is_resolved, "resolved_at": r.resolved_at,
        }
        for r in rows
    ]


@router.get("/summary")
async def issues_summary(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    rows = (await db.execute(
        select(SEOIssue.issue_type, SEOIssue.severity)
        .where(SEOIssue.website_id == website_id, SEOIssue.is_resolved == False)
    )).all()
    counts = {t: {"count": 0, "high": 0} for t in ALL_ISSUE_TYPES}
    total = 0
    for issue_type, severity in rows:
        if issue_type in counts:
            counts[issue_type]["count"] += 1
            if severity == "high":
                counts[issue_type]["high"] += 1
        total += 1
    return {"total": total, "by_type": counts}


@router.post("/scan")
async def trigger_scan(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    try:
        from app.tasks.seo_issues_tasks import scan_seo_issues
        scan_seo_issues.delay(website_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"message": "Scan SEO avancé lancé", "website_id": website_id}


@router.patch("/{issue_id}/resolve")
async def resolve_issue(
    website_id: int,
    issue_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    issue = (await db.execute(
        select(SEOIssue).where(SEOIssue.id == issue_id, SEOIssue.website_id == website_id)
    )).scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue introuvable")
    issue.is_resolved = True
    issue.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Marqué comme résolu"}


# ── Alert Config ───────────────────────────────────────────────────────────────

@router.get("/alert-config")
async def get_alert_config(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    existing = (await db.execute(
        select(SEOIssueAlertConfig).where(SEOIssueAlertConfig.website_id == website_id)
    )).scalars().all()
    existing_map = {c.issue_type: c for c in existing}

    result = []
    for issue_type in ALL_ISSUE_TYPES:
        cfg = existing_map.get(issue_type)
        result.append({
            "issue_type": issue_type,
            "label": ISSUE_LABELS.get(issue_type, issue_type),
            "enabled": cfg.enabled if cfg else True,
            "frequency": cfg.frequency if cfg else "weekly",
            "threshold": cfg.threshold if cfg else None,
            "channels": cfg.channels if cfg else [],
            "last_notified_at": cfg.last_notified_at if cfg else None,
        })
    return result


@router.put("/alert-config/{issue_type}")
async def update_alert_config(
    website_id: int,
    issue_type: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    if issue_type not in ALL_ISSUE_TYPES:
        raise HTTPException(status_code=400, detail=f"Type d'issue inconnu : {issue_type}")

    existing = (await db.execute(
        select(SEOIssueAlertConfig).where(
            SEOIssueAlertConfig.website_id == website_id,
            SEOIssueAlertConfig.issue_type == issue_type,
        )
    )).scalar_one_or_none()

    if existing:
        if "enabled" in payload:
            existing.enabled = payload["enabled"]
        if "frequency" in payload:
            existing.frequency = payload["frequency"]
        if "threshold" in payload:
            existing.threshold = payload.get("threshold")
        if "channels" in payload:
            existing.channels = payload["channels"]
    else:
        db.add(SEOIssueAlertConfig(
            website_id=website_id,
            issue_type=issue_type,
            enabled=payload.get("enabled", True),
            frequency=payload.get("frequency", "weekly"),
            threshold=payload.get("threshold"),
            channels=payload.get("channels", []),
        ))

    await db.commit()
    return {"message": "Configuration sauvegardée"}


@router.put("/alert-config")
async def update_all_alert_configs(
    website_id: int,
    payload: list[dict],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Sauvegarder la configuration de toutes les alertes en une fois."""
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    existing_map = {
        c.issue_type: c for c in (await db.execute(
            select(SEOIssueAlertConfig).where(SEOIssueAlertConfig.website_id == website_id)
        )).scalars().all()
    }
    for item in payload:
        issue_type = item.get("issue_type")
        if not issue_type or issue_type not in ALL_ISSUE_TYPES:
            continue
        if issue_type in existing_map:
            cfg = existing_map[issue_type]
            cfg.enabled = item.get("enabled", cfg.enabled)
            cfg.frequency = item.get("frequency", cfg.frequency)
            cfg.threshold = item.get("threshold", cfg.threshold)
            cfg.channels = item.get("channels", cfg.channels)
        else:
            db.add(SEOIssueAlertConfig(
                website_id=website_id,
                issue_type=issue_type,
                enabled=item.get("enabled", True),
                frequency=item.get("frequency", "weekly"),
                threshold=item.get("threshold"),
                channels=item.get("channels", []),
            ))
    await db.commit()
    return {"message": "Toutes les configurations sauvegardées"}


# ── Rapport mensuel ────────────────────────────────────────────────────────────

@router.get("/monthly-report")
async def monthly_report(
    website_id: int,
    year: int = Query(date.today().year),
    month: int = Query(date.today().month),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    site = await _check_ownership(website_id, db, current_user, effective_owner_id)

    # Fenêtre du mois demandé
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)

    # Mois précédent
    prev_end = start - timedelta(days=1)
    prev_start = date(prev_end.year, prev_end.month, 1)

    report = {
        "site": site.domain,
        "period": {"start": str(start), "end": str(end)},
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # ── GSC : performance du mois ─────────────────────────────────────────────
    try:
        from app.models.user import UserAPICredential
        from app.core.crypto import decrypt_credentials
        gsc_data = None
        gsc_prev = None
        if site.gsc_cred_id and site.gsc_property:
            cred = (await db.execute(select(UserAPICredential).where(UserAPICredential.id == site.gsc_cred_id))).scalar_one_or_none()
            if cred:
                from app.services.gsc_service import GSCService
                gsc = GSCService(credentials_json=decrypt_credentials(cred.credentials_enc), site_url=site.gsc_property)
                gsc_data = gsc.get_period_totals(str(start), str(end))
                gsc_prev = gsc.get_period_totals(str(prev_start), str(prev_end))
        report["gsc"] = {
            "clicks": gsc_data.get("total_clicks", 0) if gsc_data else None,
            "impressions": gsc_data.get("total_impressions", 0) if gsc_data else None,
            "avg_ctr": gsc_data.get("avg_ctr", 0) if gsc_data else None,
            "avg_position": gsc_data.get("avg_position", 0) if gsc_data else None,
            "prev_clicks": gsc_prev.get("total_clicks", 0) if gsc_prev else None,
            "prev_impressions": gsc_prev.get("total_impressions", 0) if gsc_prev else None,
        }
    except Exception:
        report["gsc"] = None

    # ── GA4 : trafic du mois ──────────────────────────────────────────────────
    try:
        ga4_data = None
        ga4_prev = None
        ga4_top_pages = []
        if site.ga4_cred_id and site.ga4_property_id:
            cred4 = (await db.execute(select(UserAPICredential).where(UserAPICredential.id == site.ga4_cred_id))).scalar_one_or_none()
            if cred4:
                from app.services.ga4_service import GA4Service
                ga4 = GA4Service(credentials_json=decrypt_credentials(cred4.credentials_enc), property_id=site.ga4_property_id)
                ga4_data = ga4.get_organic_totals(str(start), str(end))
                ga4_prev = ga4.get_organic_totals(str(prev_start), str(prev_end))
                ga4_top_pages = ga4.get_top_pages(days=30, limit=10)
        report["ga4"] = {
            "sessions": ga4_data.get("sessions", 0) if ga4_data else None,
            "users": ga4_data.get("users", 0) if ga4_data else None,
            "pageviews": ga4_data.get("pageviews", 0) if ga4_data else None,
            "prev_sessions": ga4_prev.get("sessions", 0) if ga4_prev else None,
            "top_pages": ga4_top_pages[:10],
        }
    except Exception:
        report["ga4"] = None

    # ── Issues détectées pendant le mois ─────────────────────────────────────
    issue_rows = (await db.execute(
        select(SEOIssue.issue_type, SEOIssue.severity, SEOIssue.is_resolved)
        .where(
            SEOIssue.website_id == website_id,
            SEOIssue.detected_at >= start,
            SEOIssue.detected_at <= end,
        )
    )).all()
    issue_counts = {}
    for it, sev, resolved in issue_rows:
        if it not in issue_counts:
            issue_counts[it] = {"total": 0, "high": 0, "resolved": 0}
        issue_counts[it]["total"] += 1
        if sev == "high":
            issue_counts[it]["high"] += 1
        if resolved:
            issue_counts[it]["resolved"] += 1
    report["issues"] = issue_counts
    report["issues_total"] = sum(v["total"] for v in issue_counts.values())

    # ── Core Web Vitals du mois ───────────────────────────────────────────────
    vitals_row = (await db.execute(text("""
        SELECT ROUND(AVG(performance_score)) as avg_score,
               COUNT(DISTINCT page_url) as pages,
               ROUND(AVG(lcp::numeric)/1000.0, 1) as avg_lcp
        FROM core_web_vitals
        WHERE website_id = :wid
          AND strategy = 'mobile'
          AND recorded_at >= :start AND recorded_at <= :end
    """), {"wid": website_id, "start": start, "end": end})).fetchone()
    report["vitals"] = {
        "avg_score": int(vitals_row.avg_score) if vitals_row and vitals_row.avg_score else None,
        "pages_scanned": vitals_row.pages if vitals_row else 0,
        "avg_lcp_s": float(vitals_row.avg_lcp) if vitals_row and vitals_row.avg_lcp else None,
    }

    # ── Mots-clés en hausse / en baisse ───────────────────────────────────────
    kw_row = (await db.execute(text("""
        WITH curr AS (
            SELECT keyword_id, AVG(position) as pos
            FROM keyword_positions
            WHERE website_id = :wid
              AND recorded_date >= :start AND recorded_date <= :end
            GROUP BY keyword_id
        ),
        prev AS (
            SELECT keyword_id, AVG(position) as pos
            FROM keyword_positions
            WHERE website_id = :wid
              AND recorded_date >= :prev_start AND recorded_date <= :prev_end
            GROUP BY keyword_id
        )
        SELECT
            COUNT(CASE WHEN c.pos < p.pos THEN 1 END) as improved,
            COUNT(CASE WHEN c.pos > p.pos THEN 1 END) as declined,
            COUNT(*) as total_kw
        FROM curr c JOIN prev p ON p.keyword_id = c.keyword_id
    """), {"wid": website_id, "start": start, "end": end, "prev_start": prev_start, "prev_end": prev_end})).fetchone()
    report["keywords"] = {
        "improved": int(kw_row.improved) if kw_row and kw_row.improved else 0,
        "declined": int(kw_row.declined) if kw_row and kw_row.declined else 0,
        "total": int(kw_row.total_kw) if kw_row and kw_row.total_kw else 0,
    }

    return report
