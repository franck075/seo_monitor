"""
Monitoring SEO avancé — 12 cas de détection :
  1.  cannibalization   — 2+ pages se battent pour le même mot-clé (GSC live)
  2.  position_drop     — page perd N positions en X jours (DB)
  3.  redirect_chain    — chaîne de redirections ou 301→302 (DB http_checks)
  4.  aging_content     — pages dont le trafic décline MoM (GA4 live)
  5.  no_impressions    — pages sans impressions depuis X jours (DB)
  6.  canonical_change  — canonique modifiée ou invalide (DB seo_changes)
  7.  robots_change     — robots.txt modifié (DB robots_snapshots)
  8.  x_robots_noindex  — en-tête HTTP X-Robots-Tag:noindex (HTTP live)
  9.  redirect_broken   — www/HTTP→HTTPS ne redirige plus (HTTP live)
  10. h1_change         — balise H1 modifiée (DB seo_changes)
  11. duplicate_title   — même Title sur 2+ pages (DB seo_snapshots)
  12. duplicate_meta    — même Meta Description sur 2+ pages (DB seo_snapshots)
"""
import re
import httpx
from collections import defaultdict
from datetime import datetime, timezone, date, timedelta
from sqlalchemy import select, delete, text, func
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.models.seo_issues import SEOIssue, SEOIssueAlertConfig

# ── Constantes ─────────────────────────────────────────────────────────────────

ALL_ISSUE_TYPES = [
    "cannibalization", "position_drop", "redirect_chain", "aging_content",
    "no_impressions", "canonical_change", "robots_change", "x_robots_noindex",
    "redirect_broken", "h1_change", "duplicate_title", "duplicate_meta",
]

DEFAULT_THRESHOLDS = {
    "position_drop": 5,    # positions perdues
    "no_impressions": 30,  # jours sans impressions
}

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; SEO-Monitor-Bot/1.0)",
    "Accept": "text/html,application/xhtml+xml,*/*",
}


# ── Détecteurs ─────────────────────────────────────────────────────────────────

async def _detect_cannibalization(website_id: int, site, gsc) -> list[dict]:
    """GSC live : 2+ pages avec ≥10 impressions pour le même mot-clé (28 jours)."""
    issues = []
    try:
        today = date.today()
        rows = gsc.get_keyword_positions(days=28, row_limit=25000)
        # group by query → pages
        query_pages: dict[str, dict] = defaultdict(lambda: defaultdict(lambda: {"imp": 0, "clicks": 0, "pos": []}))
        for r in rows:
            q = (r.get("query") or "").strip()
            p = (r.get("page") or "").strip()
            if q and p:
                query_pages[q][p]["imp"] += r.get("impressions", 0)
                query_pages[q][p]["clicks"] += r.get("clicks", 0)
                query_pages[q][p]["pos"].append(float(r.get("position", 0) or 0))

        for query, pages in query_pages.items():
            significant = {p: d for p, d in pages.items() if d["imp"] >= 10}
            if len(significant) >= 2:
                sorted_pages = sorted(significant.items(), key=lambda x: -x[1]["imp"])
                top_page = sorted_pages[0][0]
                competing = [
                    {"url": p, "impressions": d["imp"], "clicks": d["clicks"],
                     "avg_position": round(sum(d["pos"]) / len(d["pos"]), 1) if d["pos"] else 0}
                    for p, d in sorted_pages
                ]
                total_imp = sum(d["imp"] for d in significant.values())
                issues.append({
                    "url": top_page,
                    "detail": f"Cannibalisation : {len(significant)} pages se battent pour « {query} » ({total_imp} impressions)",
                    "data": {"query": query, "competing_pages": competing, "total_impressions": total_imp},
                    "severity": "high" if total_imp > 100 else "medium",
                })
    except Exception:
        pass
    return issues[:50]  # max 50 per site


async def _detect_position_drop(website_id: int, threshold: int, db) -> list[dict]:
    """DB : pages ayant perdu ≥ threshold positions — compare la meilleure position
    (MIN) sur les mots-clés COMMUNS aux deux périodes pour éviter les faux positifs."""
    issues = []
    try:
        rows = await db.execute(text("""
            WITH curr AS (
                -- Meilleure position (MIN) sur les 7 derniers jours, par (page, keyword)
                SELECT k.page, k.id AS kw_id, MIN(kp.position) AS best_pos,
                       SUM(kp.impressions) AS imp
                FROM keywords k
                JOIN keyword_positions kp ON kp.keyword_id = k.id
                WHERE k.website_id = :wid
                  AND k.page IS NOT NULL
                  AND kp.recorded_date >= CURRENT_DATE - (7 * INTERVAL '1 day')
                GROUP BY k.page, k.id
            ),
            prev AS (
                -- Même calcul sur les 7 jours précédents
                SELECT k.page, k.id AS kw_id, MIN(kp.position) AS best_pos
                FROM keywords k
                JOIN keyword_positions kp ON kp.keyword_id = k.id
                WHERE k.website_id = :wid
                  AND k.page IS NOT NULL
                  AND kp.recorded_date BETWEEN CURRENT_DATE - (14 * INTERVAL '1 day')
                                           AND CURRENT_DATE - (8 * INTERVAL '1 day')
                GROUP BY k.page, k.id
            ),
            -- Comparer uniquement les mots-clés présents dans les DEUX périodes
            common AS (
                SELECT c.page,
                       ROUND(AVG(c.best_pos)::numeric, 1) AS pos_now,
                       ROUND(AVG(p.best_pos)::numeric, 1) AS pos_prev,
                       SUM(c.imp) AS total_imp
                FROM curr c
                JOIN prev p ON p.kw_id = c.kw_id
                GROUP BY c.page
            )
            SELECT page,
                   pos_now,
                   pos_prev,
                   ROUND((pos_now - pos_prev)::numeric, 1) AS delta
            FROM common
            WHERE (pos_now - pos_prev) >= :threshold
              AND total_imp >= 5
            ORDER BY delta DESC
            LIMIT 30
        """), {"wid": website_id, "threshold": threshold})
        for page, pos_now, pos_prev, delta in rows.all():
            issues.append({
                "url": page,
                "detail": f"Chute de position : {pos_prev} → {pos_now} (−{delta} positions en 7 jours)",
                "data": {"position_now": float(pos_now), "position_prev": float(pos_prev), "delta": float(delta)},
                "severity": "high" if float(delta) >= 10 else "medium",
            })
    except Exception:
        pass
    return issues


async def _detect_redirect_chains(website_id: int, db) -> list[dict]:
    """DB http_checks : chaînes > 1 hop ou 301 → 302 mixte."""
    issues = []
    try:
        rows = await db.execute(text("""
            SELECT DISTINCT ON (page_url)
                page_url, redirect_chain, status_code, checked_at
            FROM http_checks
            WHERE website_id = :wid
              AND redirect_chain IS NOT NULL
              AND checked_at >= CURRENT_TIMESTAMP - (30 * INTERVAL '1 day')
            ORDER BY page_url, checked_at DESC
        """), {"wid": website_id})
        for page_url, chain, status_code, checked_at in rows.all():
            if not chain or not isinstance(chain, list):
                continue
            chain_len = len(chain)
            # Détecter les chaînes longues
            if chain_len > 2:
                issues.append({
                    "url": page_url,
                    "detail": f"Chaîne de redirections : {chain_len} sauts ({' → '.join(str(h.get('status', '?')) for h in chain[:5])})",
                    "data": {"chain": chain[:5], "hops": chain_len},
                    "severity": "high" if chain_len > 3 else "medium",
                })
                continue
            # Détecter 301 → 302 mixte
            codes = [h.get("status") for h in chain if isinstance(h, dict)]
            if 301 in codes and 302 in codes:
                issues.append({
                    "url": page_url,
                    "detail": f"Redirection mixte 301→302 ({' → '.join(str(c) for c in codes)})",
                    "data": {"chain": chain, "codes": codes},
                    "severity": "medium",
                })
    except Exception:
        pass
    return issues[:20]


async def _detect_aging_content(website_id: int, ga4, site_domain: str) -> list[dict]:
    """GA4 live : pages dont les sessions organiques ont baissé de >20% MoM."""
    issues = []
    try:
        today = date.today()
        curr_end = today - timedelta(days=3)
        curr_start = curr_end - timedelta(days=29)
        prev_end = curr_start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=29)

        # Comparer les sessions par page sur les deux périodes (données GA4 réelles)
        curr_pages = ga4.get_top_pages_range(
            curr_start.strftime("%Y-%m-%d"), curr_end.strftime("%Y-%m-%d"), limit=100
        )
        prev_pages = ga4.get_top_pages_range(
            prev_start.strftime("%Y-%m-%d"), prev_end.strftime("%Y-%m-%d"), limit=100
        )
        prev_map = {p["page"]: p["sessions"] for p in prev_pages}

        for page_data in curr_pages:
            page = page_data.get("page", "")
            sessions_curr = page_data.get("sessions", 0)
            sessions_prev = prev_map.get(page, 0)

            # Ignorer les pages avec très peu de trafic
            if sessions_prev < 10:
                continue
            if sessions_curr >= sessions_prev:
                continue

            decline_pct = (sessions_prev - sessions_curr) / sessions_prev * 100
            if decline_pct >= 20:
                # GA4 retourne des chemins relatifs (/path) ou absolus
                if page.startswith("http"):
                    full_url = page
                elif page.startswith("/"):
                    full_url = f"https://{site_domain}{page}"
                else:
                    full_url = f"https://{site_domain}/{page}"
                issues.append({
                    "url": full_url,
                    "detail": f"Contenu vieillissant : −{decline_pct:.0f}% de sessions organiques MoM ({sessions_prev} → {sessions_curr})",
                    "data": {
                        "page": page,
                        "sessions_curr": sessions_curr,
                        "sessions_prev": sessions_prev,
                        "decline_pct": round(decline_pct, 1),
                    },
                    "severity": "high" if decline_pct >= 40 else "medium",
                })
    except Exception:
        pass
    return issues[:10]


async def _detect_no_impressions(website_id: int, threshold_days: int, db) -> list[dict]:
    """DB : pages qui avaient des impressions il y a X jours et plus aucune depuis."""
    issues = []
    try:
        rows = await db.execute(text("""
            WITH recent AS (
                SELECT k.page, SUM(kp.impressions) AS imp_recent
                FROM keywords k
                JOIN keyword_positions kp ON kp.keyword_id = k.id
                WHERE k.website_id = :wid AND k.page IS NOT NULL
                  AND kp.recorded_date >= CURRENT_DATE - (:days * INTERVAL '1 day')
                GROUP BY k.page
            ),
            past AS (
                SELECT k.page, SUM(kp.impressions) AS imp_past
                FROM keywords k
                JOIN keyword_positions kp ON kp.keyword_id = k.id
                WHERE k.website_id = :wid AND k.page IS NOT NULL
                  AND kp.recorded_date BETWEEN CURRENT_DATE - ((:days * 2) * INTERVAL '1 day')
                                           AND CURRENT_DATE - ((:days + 1) * INTERVAL '1 day')
                GROUP BY k.page
            )
            SELECT p.page, p.imp_past, COALESCE(r.imp_recent, 0) AS imp_recent
            FROM past p
            LEFT JOIN recent r ON r.page = p.page
            WHERE p.imp_past >= 50
              AND COALESCE(r.imp_recent, 0) = 0
            ORDER BY p.imp_past DESC
            LIMIT 20
        """), {"wid": website_id, "days": threshold_days})
        for page, imp_past, imp_recent in rows.all():
            issues.append({
                "url": page,
                "detail": f"Déindex silencieux possible : {imp_past} impressions il y a {threshold_days}j, 0 depuis",
                "data": {"impressions_past": int(imp_past), "impressions_recent": 0, "period_days": threshold_days},
                "severity": "high",
            })
    except Exception:
        pass
    return issues


async def _detect_canonical_changes(website_id: int, db) -> list[dict]:
    """DB seo_changes : changements de balise canonique sur les 14 derniers jours."""
    issues = []
    try:
        rows = await db.execute(text("""
            SELECT page_url, old_value, new_value, detected_at
            FROM seo_changes
            WHERE website_id = :wid
              AND field = 'canonical'
              AND detected_at >= CURRENT_TIMESTAMP - (14 * INTERVAL '1 day')
            ORDER BY detected_at DESC
            LIMIT 20
        """), {"wid": website_id})
        for page_url, old_val, new_val, detected_at in rows.all():
            issues.append({
                "url": page_url,
                "detail": f"Canonique modifiée : « {(old_val or 'vide')[:100]} » → « {(new_val or 'vide')[:100]} »",
                "data": {"old": old_val, "new": new_val, "detected_at": str(detected_at)},
                "severity": "high" if not new_val or new_val.strip() == "" else "medium",
            })
    except Exception:
        pass
    return issues


async def _detect_robots_changes(website_id: int, db) -> list[dict]:
    """DB robots_snapshots : changements de robots.txt sur les 7 derniers jours."""
    issues = []
    try:
        rows = await db.execute(text("""
            SELECT id, recorded_at, content_hash, fetch_status
            FROM robots_snapshots
            WHERE website_id = :wid
              AND has_changed = true
              AND recorded_at >= CURRENT_TIMESTAMP - (7 * INTERVAL '1 day')
            ORDER BY recorded_at DESC
            LIMIT 5
        """), {"wid": website_id})
        for snap_id, recorded_at, content_hash, fetch_status in rows.all():
            issues.append({
                "url": None,
                "detail": f"robots.txt modifié le {recorded_at.strftime('%d/%m/%Y à %H:%M')} (statut HTTP {fetch_status})",
                "data": {"snapshot_id": snap_id, "content_hash": content_hash, "fetch_status": fetch_status, "detected_at": str(recorded_at)},
                "severity": "high",
            })
    except Exception:
        pass
    return issues


async def _detect_x_robots_noindex(website_id: int, site) -> list[dict]:
    """HTTP live : vérifier l'en-tête X-Robots-Tag: noindex sur les pages du site."""
    issues = []
    urls_to_check = [f"https://{site.domain}/"]
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False, headers=HTTP_HEADERS) as client:
            for url in urls_to_check:
                try:
                    resp = await client.get(url)
                    x_robots = resp.headers.get("x-robots-tag", "").lower()
                    if "noindex" in x_robots:
                        issues.append({
                            "url": url,
                            "detail": f"En-tête HTTP X-Robots-Tag: {resp.headers.get('x-robots-tag')} détecté sur {url}",
                            "data": {"header": resp.headers.get("x-robots-tag"), "status_code": resp.status_code},
                            "severity": "high",
                        })
                except Exception:
                    continue
    except Exception:
        pass
    return issues


async def _detect_redirect_broken(website_id: int, site) -> list[dict]:
    """HTTP live : vérifier que www→non-www et http→https redirigent correctement."""
    issues = []
    # Normaliser le domaine : toujours travailler avec le domaine nu (sans www.)
    raw_domain = site.domain.lstrip("www.") if site.domain.startswith("www.") else site.domain
    checks = [
        (f"http://{raw_domain}/", "HTTP→HTTPS", lambda r: r.status_code in (301, 302) and "https://" in r.headers.get("location", "").lower()),
        (f"http://www.{raw_domain}/", "www→HTTPS", lambda r: r.status_code in (301, 302) and "https://" in r.headers.get("location", "").lower()),
    ]
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False, headers=HTTP_HEADERS) as client:
            for url, check_name, validator in checks:
                try:
                    resp = await client.get(url)
                    if not validator(resp):
                        loc = resp.headers.get("location", "—")
                        issues.append({
                            "url": url,
                            "detail": f"Redirection {check_name} absente ou incorrecte (HTTP {resp.status_code}, Location: {loc[:100]})",
                            "data": {"check": check_name, "status_code": resp.status_code, "location": loc},
                            "severity": "high",
                        })
                except Exception as e:
                    issues.append({
                        "url": url,
                        "detail": f"Redirection {check_name} : erreur de connexion ({str(e)[:80]})",
                        "data": {"check": check_name, "error": str(e)[:200]},
                        "severity": "high",
                    })
    except Exception:
        pass
    return issues


async def _detect_h1_changes(website_id: int, db) -> list[dict]:
    """DB seo_changes : changements de balise H1 sur les 14 derniers jours."""
    issues = []
    try:
        rows = await db.execute(text("""
            SELECT page_url, old_value, new_value, detected_at
            FROM seo_changes
            WHERE website_id = :wid
              AND field = 'h1'
              AND detected_at >= CURRENT_TIMESTAMP - (14 * INTERVAL '1 day')
            ORDER BY detected_at DESC
            LIMIT 20
        """), {"wid": website_id})
        for page_url, old_val, new_val, detected_at in rows.all():
            issues.append({
                "url": page_url,
                "detail": f"H1 modifié : « {(old_val or 'vide')[:100]} » → « {(new_val or 'vide')[:100]} »",
                "data": {"old": old_val, "new": new_val, "detected_at": str(detected_at)},
                "severity": "medium",
            })
    except Exception:
        pass
    return issues


async def _detect_duplicate_titles(website_id: int, db) -> list[dict]:
    """DB seo_snapshots : même Title sur 2+ pages."""
    issues = []
    try:
        rows = await db.execute(text("""
            WITH latest AS (
                SELECT DISTINCT ON (page_url) page_url, title, recorded_at
                FROM seo_snapshots
                WHERE website_id = :wid AND title IS NOT NULL AND title <> ''
                ORDER BY page_url, recorded_at DESC
            )
            SELECT title, ARRAY_AGG(page_url) AS pages, COUNT(*) AS cnt
            FROM latest
            GROUP BY title
            HAVING COUNT(*) >= 2
            ORDER BY cnt DESC
            LIMIT 20
        """), {"wid": website_id})
        for title, pages, cnt in rows.all():
            issues.append({
                "url": pages[0] if pages else None,
                "detail": f"Titre dupliqué sur {cnt} pages : « {(title or '')[:100]} »",
                "data": {"title": title, "pages": list(pages), "count": int(cnt)},
                "severity": "medium",
            })
    except Exception:
        pass
    return issues


async def _detect_duplicate_metas(website_id: int, db) -> list[dict]:
    """DB seo_snapshots : même Meta Description sur 2+ pages."""
    issues = []
    try:
        rows = await db.execute(text("""
            WITH latest AS (
                SELECT DISTINCT ON (page_url) page_url, meta_description, recorded_at
                FROM seo_snapshots
                WHERE website_id = :wid AND meta_description IS NOT NULL AND meta_description <> ''
                ORDER BY page_url, recorded_at DESC
            )
            SELECT meta_description, ARRAY_AGG(page_url) AS pages, COUNT(*) AS cnt
            FROM latest
            GROUP BY meta_description
            HAVING COUNT(*) >= 2
            ORDER BY cnt DESC
            LIMIT 20
        """), {"wid": website_id})
        for meta, pages, cnt in rows.all():
            issues.append({
                "url": pages[0] if pages else None,
                "detail": f"Meta description dupliquée sur {cnt} pages : « {(meta or '')[:100]} »",
                "data": {"meta": meta, "pages": list(pages), "count": int(cnt)},
                "severity": "medium",
            })
    except Exception:
        pass
    return issues


# ── Orchestrateur principal ────────────────────────────────────────────────────

async def _scan_seo_issues(website_id: int):
    factory = get_sync_session()
    async with factory() as db:
        site = (await db.execute(
            select(Website).where(Website.id == website_id, Website.is_active == True)
        )).scalar_one_or_none()
        if not site:
            return

        # Charger les configs d'alertes pour ce site
        cfg_rows = (await db.execute(
            select(SEOIssueAlertConfig).where(SEOIssueAlertConfig.website_id == website_id)
        )).scalars().all()
        configs = {c.issue_type: c for c in cfg_rows}

        # Initialiser les services GSC / GA4 si disponibles
        gsc = None
        ga4 = None
        try:
            from app.models.user import UserAPICredential
            from app.core.crypto import decrypt_credentials
            if site.gsc_cred_id and site.gsc_property:
                cred = (await db.execute(select(UserAPICredential).where(UserAPICredential.id == site.gsc_cred_id))).scalar_one_or_none()
                if cred:
                    from app.services.gsc_service import GSCService
                    gsc = GSCService(credentials_json=decrypt_credentials(cred.credentials_enc), site_url=site.gsc_property)
            if site.ga4_cred_id and site.ga4_property_id:
                cred4 = (await db.execute(select(UserAPICredential).where(UserAPICredential.id == site.ga4_cred_id))).scalar_one_or_none()
                if cred4:
                    from app.services.ga4_service import GA4Service
                    ga4 = GA4Service(credentials_json=decrypt_credentials(cred4.credentials_enc), property_id=site.ga4_property_id)
        except Exception:
            pass

        # Charger les seuils depuis les configs
        pos_threshold = int((configs.get("position_drop") or SEOIssueAlertConfig()).threshold or DEFAULT_THRESHOLDS["position_drop"])
        no_imp_days = int((configs.get("no_impressions") or SEOIssueAlertConfig()).threshold or DEFAULT_THRESHOLDS["no_impressions"])

        # ── Exécuter tous les détecteurs ─────────────────────────────────────
        all_results: dict[str, list[dict]] = {}

        if gsc:
            all_results["cannibalization"] = await _detect_cannibalization(website_id, site, gsc)
        all_results["position_drop"] = await _detect_position_drop(website_id, pos_threshold, db)
        all_results["redirect_chain"] = await _detect_redirect_chains(website_id, db)
        if ga4:
            all_results["aging_content"] = await _detect_aging_content(website_id, ga4, site.domain)
        all_results["no_impressions"] = await _detect_no_impressions(website_id, no_imp_days, db)
        all_results["canonical_change"] = await _detect_canonical_changes(website_id, db)
        all_results["robots_change"] = await _detect_robots_changes(website_id, db)
        all_results["x_robots_noindex"] = await _detect_x_robots_noindex(website_id, site)
        all_results["redirect_broken"] = await _detect_redirect_broken(website_id, site)
        all_results["h1_change"] = await _detect_h1_changes(website_id, db)
        all_results["duplicate_title"] = await _detect_duplicate_titles(website_id, db)
        all_results["duplicate_meta"] = await _detect_duplicate_metas(website_id, db)

        # ── Mettre à jour la DB : supprimer les anciens non-résolus et insérer ─
        for issue_type, detections in all_results.items():
            await db.execute(
                delete(SEOIssue).where(
                    SEOIssue.website_id == website_id,
                    SEOIssue.issue_type == issue_type,
                    SEOIssue.is_resolved == False,
                )
            )
            for det in detections:
                db.add(SEOIssue(
                    website_id=website_id,
                    issue_type=issue_type,
                    severity=det.get("severity", "medium"),
                    url=det.get("url"),
                    detail=det.get("detail"),
                    data=det.get("data"),
                ))

        await db.commit()

        # ── Envoyer les alertes selon la configuration ─────────────────────────
        await _maybe_send_alerts(website_id, site, all_results, configs, db)


async def _maybe_send_alerts(website_id: int, site, all_results: dict, configs: dict, db):
    """Envoie les alertes email/telegram si la fréquence configurée est atteinte."""
    now = datetime.now(timezone.utc)
    alerts_to_send = []

    for issue_type, detections in all_results.items():
        if not detections:
            continue
        cfg = configs.get(issue_type)
        if not cfg or not cfg.enabled:
            continue
        freq = cfg.frequency or "weekly"
        last = cfg.last_notified_at

        # Vérifier si le délai depuis la dernière notification est écoulé
        if last:
            elapsed = (now - last).total_seconds()
            if freq == "daily" and elapsed < 86400:
                continue
            if freq == "weekly" and elapsed < 604800:
                continue
            if freq == "monthly" and elapsed < 2592000:
                continue

        alerts_to_send.append((issue_type, detections, cfg))

    if not alerts_to_send:
        return

    # Charger l'email de notification de l'utilisateur
    try:
        from sqlalchemy import text as sqlt
        user_row = await db.execute(sqlt(
            "SELECT u.email, u.alert_email, u.full_name FROM users u JOIN websites w ON w.user_id = u.id WHERE w.id = :wid"
        ), {"wid": website_id})
        user = user_row.fetchone()
        if not user:
            return
        email_to = user.alert_email or user.email
        user_name = user.full_name or user.email

        from app.services.email_service import send_alert_email
        from datetime import datetime as dt

        # Construire l'email récapitulatif
        issue_labels = {
            "cannibalization": "Cannibalisation de mots-clés",
            "position_drop": "Chutes de positions",
            "redirect_chain": "Chaînes de redirections",
            "aging_content": "Contenu vieillissant",
            "no_impressions": "Déindex silencieux",
            "canonical_change": "Changement de canonique",
            "robots_change": "Modification robots.txt",
            "x_robots_noindex": "X-Robots-Tag noindex",
            "redirect_broken": "Redirection www/HTTPS cassée",
            "h1_change": "Changement de H1",
            "duplicate_title": "Titres en doublon",
            "duplicate_meta": "Meta descriptions en doublon",
        }

        rows_html = ""
        for issue_type, detections, cfg in alerts_to_send:
            label = issue_labels.get(issue_type, issue_type)
            count = len(detections)
            top = detections[0].get("detail", "")[:150]
            rows_html += f"""
            <tr>
              <td style="padding:8px;border:1px solid #ddd;background:#fff8f8"><b>{label}</b></td>
              <td style="padding:8px;border:1px solid #ddd">{count} problème(s)</td>
              <td style="padding:8px;border:1px solid #ddd;font-size:12px;color:#666">{top}</td>
            </tr>"""

        html = f"""
        <html><body style="font-family:sans-serif;padding:20px;color:#333;max-width:700px">
          <h2 style="color:#e53e3e">⚠️ Rapport SEO — {site.display_name or site.domain}</h2>
          <p>Bonjour {user_name},</p>
          <p>Voici les problèmes SEO détectés sur <b>{site.domain}</b> :</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0">
            <tr style="background:#f5f5f5">
              <th style="padding:8px;border:1px solid #ddd;text-align:left">Problème</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left">Occurrences</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left">Détail</th>
            </tr>
            {rows_html}
          </table>
          <p style="margin-top:20px">
            <a href="https://app.seoalertscan.com/websites/{website_id}/seo-issues"
               style="background:#3182ce;color:white;padding:10px 20px;text-decoration:none;border-radius:4px">
              Voir dans l'outil →
            </a>
          </p>
          <p style="margin-top:30px;color:#999;font-size:12px">SEO Alert Scan — Monitoring automatique</p>
        </body></html>
        """
        await send_alert_email(email_to, f"[SEO Alert] {len(alerts_to_send)} problème(s) détectés sur {site.domain}", html)

        # Mettre à jour last_notified_at pour chaque config notifiée
        for issue_type, _, cfg in alerts_to_send:
            cfg.last_notified_at = now

        await db.commit()
    except Exception:
        pass


# ── Celery tasks ───────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.seo_issues_tasks.scan_seo_issues", bind=True, max_retries=1)
def scan_seo_issues(self, website_id: int):
    try:
        run_async(_scan_seo_issues(website_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.seo_issues_tasks.scan_seo_issues_all_sites")
def scan_seo_issues_all_sites():
    async def _get_ids():
        factory = get_sync_session()
        async with factory() as db:
            rows = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in rows.all()]
    ids = run_async(_get_ids())
    for wid in ids:
        scan_seo_issues.delay(wid)
