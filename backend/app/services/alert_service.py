from datetime import datetime, timezone
from typing import Optional, Tuple, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.alert import AlertRule, AlertEvent, MonitoredKeyword
from app.models.monitoring import (
    TrafficSnapshot, CoreWebVital, SEOChange, HTTPCheck, HTTPMonitor,
    RobotsSnapshot, SitemapSnapshot, SitemapURL, IndexationError, IndexationMonitor, SEOMonitor,
)
from app.models.keyword import Keyword, KeywordPosition


class AlertService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def evaluate_all_for_website(self, website_id: int):
        result = await self.db.execute(
            select(AlertRule).where(
                AlertRule.website_id == website_id,
                AlertRule.is_active == True,
            )
        )
        rules = result.scalars().all()
        for rule in rules:
            await self.evaluate_rule(rule, website_id)

    async def evaluate_rule(self, rule: AlertRule, website_id: int):
        evaluators = {
            "keyword_position_drop": self._eval_keyword_position_drop,
            "traffic_drop": self._eval_traffic_drop,
            "traffic_spike": self._eval_traffic_spike,
            "vitals_degradation": self._eval_vitals_degradation,
            "seo_change_detected": self._eval_seo_change,
            "http_error": self._eval_http_error,
            "robots_changed": self._eval_robots_changed,
            "sitemap_url_removed": self._eval_sitemap_url_removed,
            "indexation_error_spike": self._eval_indexation_spike,
            "impressions_drop": self._eval_impressions_drop,
            "clicks_drop": self._eval_clicks_drop,
            "ctr_drop": self._eval_ctr_drop,
            "keyword_impressions_drop": self._eval_keyword_impressions_drop,
            "keyword_clicks_drop": self._eval_keyword_clicks_drop,
            "page_impressions_drop": self._eval_page_impressions_drop,
            "zero_organic_pages_monthly": self._eval_zero_organic_pages_monthly,
        }
        fn = evaluators.get(rule.metric)
        if not fn:
            return
        triggered, value, context = await fn(rule, website_id)
        if not triggered:
            return
        # Les alertes mensuelles gèrent leur propre cooldown dans l'évaluateur
        if rule.metric != "zero_organic_pages_monthly" and await self._in_cooldown(rule.id):
            return
        event = AlertEvent(
            rule_id=rule.id,
            website_id=website_id,
            fired_at=datetime.now(timezone.utc),
            metric_value=value,
            context_json=context,
            channels_sent=rule.channels,
            status="sent",
        )
        self.db.add(event)
        await self.db.flush()
        await self._dispatch_notifications(rule, event, context)

    async def _in_cooldown(self, rule_id: int) -> bool:
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=60)
        result = await self.db.execute(
            select(AlertEvent).where(
                AlertEvent.rule_id == rule_id,
                AlertEvent.fired_at > cutoff,
                AlertEvent.status == "sent",
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _eval_keyword_position_drop(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        result = await self.db.execute(
            select(KeywordPosition)
            .where(KeywordPosition.website_id == website_id)
            .order_by(KeywordPosition.recorded_date.desc())
            .limit(200)
        )
        rows = result.scalars().all()
        threshold = float(rule.threshold or 5)
        for row in rows:
            if row.position and row.position > threshold:
                return True, float(row.position), {"keyword_id": row.keyword_id, "position": float(row.position)}
        return False, None, {}

    async def _eval_traffic_drop(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        # Compare last day vs 7-day rolling average (excluding last day)
        result = await self.db.execute(
            select(TrafficSnapshot)
            .where(TrafficSnapshot.website_id == website_id, TrafficSnapshot.source == "organic")
            .order_by(TrafficSnapshot.recorded_date.desc())
            .limit(15)
        )
        rows = result.scalars().all()
        if len(rows) < 3:
            return False, None, {}
        latest = rows[0]
        baseline_rows = rows[1:8]  # 7 days before latest
        avg_sessions = sum(r.sessions or 0 for r in baseline_rows) / len(baseline_rows)
        if avg_sessions == 0:
            return False, None, {}
        drop_pct = (avg_sessions - (latest.sessions or 0)) / avg_sessions
        threshold = float(rule.threshold or 0.3)  # default 30% drop
        if drop_pct >= threshold:
            return True, round(drop_pct, 4), {
                "latest_sessions": latest.sessions,
                "avg_7d_sessions": round(avg_sessions, 0),
                "drop_pct": round(drop_pct * 100, 1),
                "date": str(latest.recorded_date),
            }
        return False, None, {}

    async def _eval_traffic_spike(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        # Spike: latest day > X% above 7-day rolling average
        result = await self.db.execute(
            select(TrafficSnapshot)
            .where(TrafficSnapshot.website_id == website_id, TrafficSnapshot.source == "organic")
            .order_by(TrafficSnapshot.recorded_date.desc())
            .limit(15)
        )
        rows = result.scalars().all()
        if len(rows) < 3:
            return False, None, {}
        latest = rows[0]
        baseline_rows = rows[1:8]
        avg_sessions = sum(r.sessions or 0 for r in baseline_rows) / len(baseline_rows)
        if avg_sessions == 0:
            return False, None, {}
        spike_pct = ((latest.sessions or 0) - avg_sessions) / avg_sessions
        threshold = float(rule.threshold or 0.5)  # default 50% spike
        if spike_pct >= threshold:
            return True, round(spike_pct, 4), {
                "latest_sessions": latest.sessions,
                "avg_7d_sessions": round(avg_sessions, 0),
                "spike_pct": round(spike_pct * 100, 1),
                "date": str(latest.recorded_date),
            }
        return False, None, {}

    async def _eval_vitals_degradation(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        result = await self.db.execute(
            select(CoreWebVital)
            .where(CoreWebVital.website_id == website_id)
            .order_by(CoreWebVital.recorded_at.desc())
            .limit(1)
        )
        vital = result.scalar_one_or_none()
        if not vital:
            return False, None, {}
        poor_metrics = [m for m in ["lcp_rating", "cls_rating", "inp_rating"] if getattr(vital, m) == "poor"]
        if poor_metrics:
            return True, None, {"poor_metrics": poor_metrics, "url": vital.page_url}
        return False, None, {}

    async def _eval_seo_change(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=rule.window_minutes or 1440)
        result = await self.db.execute(
            select(SEOChange)
            .where(SEOChange.website_id == website_id, SEOChange.detected_at > cutoff)
            .limit(1)
        )
        change = result.scalar_one_or_none()
        if change:
            return True, None, {"field": change.field, "url": change.page_url}
        return False, None, {}

    async def _eval_http_error(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        result = await self.db.execute(
            select(HTTPCheck)
            .where(HTTPCheck.website_id == website_id, HTTPCheck.is_error == True)
            .order_by(HTTPCheck.checked_at.desc())
            .limit(1)
        )
        check = result.scalar_one_or_none()
        if check:
            return True, float(check.status_code or 0), {"url": check.page_url, "status_code": check.status_code}
        return False, None, {}

    async def _eval_robots_changed(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        result = await self.db.execute(
            select(RobotsSnapshot)
            .where(RobotsSnapshot.website_id == website_id, RobotsSnapshot.has_changed == True)
            .order_by(RobotsSnapshot.recorded_at.desc())
            .limit(1)
        )
        snap = result.scalar_one_or_none()
        if snap:
            return True, None, {"recorded_at": str(snap.recorded_at)}
        return False, None, {}

    async def _eval_sitemap_url_removed(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        result = await self.db.execute(
            select(func.count(SitemapURL.id))
            .join(SitemapSnapshot, SitemapURL.snapshot_id == SitemapSnapshot.id)
            .where(SitemapSnapshot.website_id == website_id, SitemapURL.status == "removed")
        )
        count = result.scalar() or 0
        if count > 0:
            return True, float(count), {"removed_count": count}
        return False, None, {}

    async def _eval_indexation_spike(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        today_count = await self.db.execute(
            select(func.count(IndexationError.id)).where(
                IndexationError.website_id == website_id,
                IndexationError.recorded_at > now - timedelta(hours=24),
            )
        )
        week_avg = await self.db.execute(
            select(func.count(IndexationError.id) / 7.0).where(
                IndexationError.website_id == website_id,
                IndexationError.recorded_at > now - timedelta(days=7),
            )
        )
        today_val = today_count.scalar() or 0
        avg_val = week_avg.scalar() or 0
        threshold = float(rule.threshold or 1.5)
        if avg_val > 0 and today_val > avg_val * threshold:
            return True, float(today_val), {"today": today_val, "weekly_avg": round(avg_val, 1)}
        return False, None, {}

    async def _get_daily_gsc_totals(self, website_id: int, days: int = 9):
        """Returns list of (date, total_clicks, total_impressions, avg_ctr) ordered by date desc."""
        from sqlalchemy import cast, Date as SADate
        result = await self.db.execute(
            select(
                KeywordPosition.recorded_date,
                func.sum(KeywordPosition.clicks).label("total_clicks"),
                func.sum(KeywordPosition.impressions).label("total_impressions"),
                func.avg(KeywordPosition.ctr).label("avg_ctr"),
            )
            .where(KeywordPosition.website_id == website_id)
            .group_by(KeywordPosition.recorded_date)
            .order_by(KeywordPosition.recorded_date.desc())
            .limit(days)
        )
        return result.all()

    async def _eval_impressions_drop(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        rows = await self._get_daily_gsc_totals(website_id)
        if len(rows) < 3:
            return False, None, {}
        latest = rows[0]
        baseline = rows[1:8]
        avg_imp = sum(float(r.total_impressions or 0) for r in baseline) / len(baseline)
        if avg_imp == 0:
            return False, None, {}
        latest_imp = float(latest.total_impressions or 0)
        drop_pct = (avg_imp - latest_imp) / avg_imp
        threshold = float(rule.threshold or 0.30)
        if drop_pct >= threshold:
            return True, round(drop_pct, 4), {
                "latest_impressions": int(latest_imp),
                "avg_7d_impressions": round(avg_imp, 0),
                "drop_pct": round(drop_pct * 100, 1),
                "date": str(latest.recorded_date),
            }
        return False, None, {}

    async def _eval_clicks_drop(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        rows = await self._get_daily_gsc_totals(website_id)
        if len(rows) < 3:
            return False, None, {}
        latest = rows[0]
        baseline = rows[1:8]
        avg_clicks = sum(float(r.total_clicks or 0) for r in baseline) / len(baseline)
        if avg_clicks == 0:
            return False, None, {}
        latest_clicks = float(latest.total_clicks or 0)
        drop_pct = (avg_clicks - latest_clicks) / avg_clicks
        threshold = float(rule.threshold or 0.30)
        if drop_pct >= threshold:
            return True, round(drop_pct, 4), {
                "latest_clicks": int(latest_clicks),
                "avg_7d_clicks": round(avg_clicks, 0),
                "drop_pct": round(drop_pct * 100, 1),
                "date": str(latest.recorded_date),
            }
        return False, None, {}

    async def _eval_ctr_drop(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        rows = await self._get_daily_gsc_totals(website_id)
        if len(rows) < 3:
            return False, None, {}
        latest = rows[0]
        baseline = rows[1:8]
        avg_ctr = sum(float(r.avg_ctr or 0) for r in baseline) / len(baseline)
        if avg_ctr == 0:
            return False, None, {}
        latest_ctr = float(latest.avg_ctr or 0)
        drop_pts = (avg_ctr - latest_ctr) * 100  # in percentage points
        threshold = float(rule.threshold or 2.0)  # default: 2 percentage points drop
        if drop_pts >= threshold:
            return True, round(drop_pts, 2), {
                "latest_ctr": round(latest_ctr * 100, 2),
                "avg_7d_ctr": round(avg_ctr * 100, 2),
                "drop_pts": round(drop_pts, 2),
                "date": str(latest.recorded_date),
            }
        return False, None, {}

    async def _eval_keyword_impressions_drop(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        """Trouve les mots-clés qui ont perdu X% d'impressions (7 derniers jours vs 7 jours précédents)."""
        from datetime import date, timedelta
        from sqlalchemy import text
        threshold = float(rule.threshold or 30.0)
        today = date.today()
        week1_start = today - timedelta(days=7)
        week1_end = today - timedelta(days=1)
        week2_start = today - timedelta(days=14)
        week2_end = today - timedelta(days=8)

        result = await self.db.execute(text("""
            WITH
            current_week AS (
                SELECT kp.keyword_id, k.query,
                       SUM(kp.impressions) AS imp_now,
                       SUM(kp.clicks) AS clicks_now
                FROM keyword_positions kp
                JOIN keywords k ON k.id = kp.keyword_id
                WHERE kp.website_id = :wid
                  AND kp.recorded_date BETWEEN :w1s AND :w1e
                GROUP BY kp.keyword_id, k.query
            ),
            prev_week AS (
                SELECT kp.keyword_id,
                       SUM(kp.impressions) AS imp_prev,
                       SUM(kp.clicks) AS clicks_prev
                FROM keyword_positions kp
                WHERE kp.website_id = :wid
                  AND kp.recorded_date BETWEEN :w2s AND :w2e
                GROUP BY kp.keyword_id
            )
            SELECT cw.query,
                   cw.imp_now, pw.imp_prev,
                   cw.clicks_now, pw.clicks_prev,
                   ROUND(((pw.imp_prev - cw.imp_now)::float / NULLIF(pw.imp_prev, 0) * 100)::numeric, 1) AS drop_pct
            FROM current_week cw
            JOIN prev_week pw ON pw.keyword_id = cw.keyword_id
            WHERE pw.imp_prev > 0
              AND (pw.imp_prev - cw.imp_now)::float / pw.imp_prev * 100 >= :threshold
            ORDER BY drop_pct DESC
            LIMIT 20
        """), {
            "wid": website_id,
            "w1s": week1_start, "w1e": week1_end,
            "w2s": week2_start, "w2e": week2_end,
            "threshold": threshold,
        })
        losers = result.all()
        if not losers:
            return False, None, {}

        affected = [
            {
                "query": r.query,
                "impressions_now": int(r.imp_now or 0),
                "impressions_prev": int(r.imp_prev or 0),
                "drop_pct": float(r.drop_pct or 0),
            }
            for r in losers
        ]
        top = affected[0]
        return True, top["drop_pct"], {
            "affected_count": len(affected),
            "top_loser": top["query"],
            "top_drop_pct": top["drop_pct"],
            "top_impressions_now": top["impressions_now"],
            "top_impressions_prev": top["impressions_prev"],
            "keywords": affected[:5],
            "period": "7j vs 7j précédents",
        }

    async def _eval_keyword_clicks_drop(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        """Trouve les mots-clés qui ont perdu X% de clics (7 derniers jours vs 7 jours précédents)."""
        from datetime import date, timedelta
        from sqlalchemy import text
        threshold = float(rule.threshold or 30.0)
        today = date.today()
        week1_start = today - timedelta(days=7)
        week1_end = today - timedelta(days=1)
        week2_start = today - timedelta(days=14)
        week2_end = today - timedelta(days=8)

        result = await self.db.execute(text("""
            WITH
            current_week AS (
                SELECT kp.keyword_id, k.query,
                       SUM(kp.clicks) AS clicks_now,
                       SUM(kp.impressions) AS imp_now
                FROM keyword_positions kp
                JOIN keywords k ON k.id = kp.keyword_id
                WHERE kp.website_id = :wid
                  AND kp.recorded_date BETWEEN :w1s AND :w1e
                GROUP BY kp.keyword_id, k.query
            ),
            prev_week AS (
                SELECT kp.keyword_id,
                       SUM(kp.clicks) AS clicks_prev
                FROM keyword_positions kp
                WHERE kp.website_id = :wid
                  AND kp.recorded_date BETWEEN :w2s AND :w2e
                GROUP BY kp.keyword_id
            )
            SELECT cw.query,
                   cw.clicks_now, pw.clicks_prev, cw.imp_now,
                   ROUND(((pw.clicks_prev - cw.clicks_now)::float / NULLIF(pw.clicks_prev, 0) * 100)::numeric, 1) AS drop_pct
            FROM current_week cw
            JOIN prev_week pw ON pw.keyword_id = cw.keyword_id
            WHERE pw.clicks_prev > 0
              AND (pw.clicks_prev - cw.clicks_now)::float / pw.clicks_prev * 100 >= :threshold
            ORDER BY drop_pct DESC
            LIMIT 20
        """), {
            "wid": website_id,
            "w1s": week1_start, "w1e": week1_end,
            "w2s": week2_start, "w2e": week2_end,
            "threshold": threshold,
        })
        losers = result.all()
        if not losers:
            return False, None, {}

        affected = [
            {
                "query": r.query,
                "clicks_now": int(r.clicks_now or 0),
                "clicks_prev": int(r.clicks_prev or 0),
                "drop_pct": float(r.drop_pct or 0),
            }
            for r in losers
        ]
        top = affected[0]
        return True, top["drop_pct"], {
            "affected_count": len(affected),
            "top_loser": top["query"],
            "top_drop_pct": top["drop_pct"],
            "top_clicks_now": top["clicks_now"],
            "top_clicks_prev": top["clicks_prev"],
            "keywords": affected[:5],
            "period": "7j vs 7j précédents",
        }

    async def _eval_page_impressions_drop(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        """Trouve les pages qui ont perdu X% d'impressions (7 derniers jours vs 7 jours précédents)."""
        from datetime import date, timedelta
        from sqlalchemy import text
        threshold = float(rule.threshold or 30.0)
        today = date.today()
        week1_start = today - timedelta(days=7)
        week1_end = today - timedelta(days=1)
        week2_start = today - timedelta(days=14)
        week2_end = today - timedelta(days=8)

        result = await self.db.execute(text("""
            WITH
            current_week AS (
                SELECT k.page,
                       SUM(kp.impressions) AS imp_now,
                       SUM(kp.clicks) AS clicks_now
                FROM keyword_positions kp
                JOIN keywords k ON k.id = kp.keyword_id
                WHERE kp.website_id = :wid
                  AND kp.recorded_date BETWEEN :w1s AND :w1e
                  AND k.page IS NOT NULL
                GROUP BY k.page
            ),
            prev_week AS (
                SELECT k.page,
                       SUM(kp.impressions) AS imp_prev
                FROM keyword_positions kp
                JOIN keywords k ON k.id = kp.keyword_id
                WHERE kp.website_id = :wid
                  AND kp.recorded_date BETWEEN :w2s AND :w2e
                  AND k.page IS NOT NULL
                GROUP BY k.page
            )
            SELECT cw.page,
                   cw.imp_now, pw.imp_prev, cw.clicks_now,
                   ROUND(((pw.imp_prev - cw.imp_now)::float / NULLIF(pw.imp_prev, 0) * 100)::numeric, 1) AS drop_pct
            FROM current_week cw
            JOIN prev_week pw ON pw.page = cw.page
            WHERE pw.imp_prev > 10
              AND (pw.imp_prev - cw.imp_now)::float / pw.imp_prev * 100 >= :threshold
            ORDER BY (pw.imp_prev - cw.imp_now) DESC
            LIMIT 20
        """), {
            "wid": website_id,
            "w1s": week1_start, "w1e": week1_end,
            "w2s": week2_start, "w2e": week2_end,
            "threshold": threshold,
        })
        losers = result.all()
        if not losers:
            return False, None, {}

        affected = [
            {
                "page": r.page,
                "impressions_now": int(r.imp_now or 0),
                "impressions_prev": int(r.imp_prev or 0),
                "drop_pct": float(r.drop_pct or 0),
            }
            for r in losers
        ]
        top = affected[0]
        return True, top["drop_pct"], {
            "affected_count": len(affected),
            "top_loser_page": top["page"],
            "top_drop_pct": top["drop_pct"],
            "top_impressions_now": top["impressions_now"],
            "top_impressions_prev": top["impressions_prev"],
            "pages": affected[:5],
            "period": "7j vs 7j précédents",
        }

    async def _in_monthly_cooldown(self, rule_id: int) -> bool:
        """Vérifie si une alerte a déjà été envoyée ce mois-ci."""
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=28)
        result = await self.db.execute(
            select(AlertEvent).where(
                AlertEvent.rule_id == rule_id,
                AlertEvent.fired_at > cutoff,
                AlertEvent.status == "sent",
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def _eval_zero_organic_pages_monthly(self, rule: AlertRule, website_id: int) -> Tuple[bool, Optional[float], Dict]:
        """Détecte les pages sans trafic organique sur le mois — se déclenche le dernier jour du mois."""
        import calendar
        from datetime import date
        from sqlalchemy import text

        today = date.today()
        last_day = calendar.monthrange(today.year, today.month)[1]
        if today.day != last_day:
            return False, None, {}

        # Cooldown mensuel : ne pas envoyer si déjà envoyé ce mois
        if await self._in_monthly_cooldown(rule.id):
            return False, None, {}

        # Récupère les credentials GA4 du site
        from app.models.website import Website
        from app.models.user import UserAPICredential
        from app.core.crypto import decrypt_credentials
        from app.services.ga4_service import GA4Service

        site_row = (await self.db.execute(
            select(Website).where(Website.id == website_id)
        )).scalar_one_or_none()
        if not site_row or not site_row.ga4_property_id or not site_row.ga4_cred_id:
            return False, None, {}

        cred = (await self.db.execute(
            select(UserAPICredential).where(UserAPICredential.id == site_row.ga4_cred_id)
        )).scalar_one_or_none()
        if not cred:
            return False, None, {}

        try:
            credentials_json = decrypt_credentials(cred.credentials_enc)
            ga4 = GA4Service(credentials_json=credentials_json, property_id=site_row.ga4_property_id)

            month_start = today.replace(day=1)
            all_pages = set(ga4.get_pages_with_any_traffic(start=month_start, end=today))
            organic_pages = set(ga4.get_pages_with_organic_traffic(start=month_start, end=today))
            zero_pages = sorted(all_pages - organic_pages)
        except Exception as e:
            return False, None, {"error": str(e)}

        if not zero_pages:
            return False, None, {}

        month_label = today.strftime("%B %Y")
        return True, float(len(zero_pages)), {
            "month": month_label,
            "zero_organic_count": len(zero_pages),
            "all_pages_count": len(all_pages),
            "pages": zero_pages[:20],
        }

    async def evaluate_monitored_keywords(self, website_id: int):
        """Check position transitions for all monitored keywords of this website."""
        monitors_result = await self.db.execute(
            select(MonitoredKeyword).where(MonitoredKeyword.website_id == website_id)
        )
        monitors = monitors_result.scalars().all()
        if not monitors:
            return

        for monitor in monitors:
            # Get the two latest positions for this keyword
            pos_result = await self.db.execute(
                select(KeywordPosition)
                .where(KeywordPosition.keyword_id == monitor.keyword_id)
                .order_by(KeywordPosition.recorded_date.desc())
                .limit(2)
            )
            positions = pos_result.scalars().all()
            if not positions:
                continue

            new_pos = float(positions[0].position) if positions[0].position else None
            if new_pos is None:
                continue

            # Previous position: use DB stored or second row
            old_pos = float(monitor.last_known_position) if monitor.last_known_position else (
                float(positions[1].position) if len(positions) > 1 and positions[1].position else None
            )

            # Detect transitions
            events: List[Dict] = []

            if old_pos is not None:
                if monitor.notify_exit_top10 and old_pos <= 10 and new_pos > 10:
                    events.append({
                        "type": "exit_top10",
                        "emoji": "🔴",
                        "label": "Sortie du Top 10",
                        "old": old_pos,
                        "new": new_pos,
                    })
                if monitor.notify_enter_top10 and old_pos > 10 and new_pos <= 10:
                    events.append({
                        "type": "enter_top10",
                        "emoji": "🟢",
                        "label": "Entrée dans le Top 10",
                        "old": old_pos,
                        "new": new_pos,
                    })
                if monitor.notify_enter_top3 and old_pos > 3 and new_pos <= 3:
                    events.append({
                        "type": "enter_top3",
                        "emoji": "🏆",
                        "label": "Entrée dans le Top 3",
                        "old": old_pos,
                        "new": new_pos,
                    })
                if monitor.notify_rank1 and old_pos > 1.5 and new_pos <= 1.5:
                    events.append({
                        "type": "rank1",
                        "emoji": "🥇",
                        "label": "1ère position !",
                        "old": old_pos,
                        "new": new_pos,
                    })

            # Update stored position
            monitor.last_known_position = new_pos

            if not events:
                continue

            # Load keyword query and user info once
            kw_result = await self.db.execute(select(Keyword).where(Keyword.id == monitor.keyword_id))
            kw = kw_result.scalar_one_or_none()
            kw_query = kw.query if kw else f"keyword#{monitor.keyword_id}"

            from app.models.website import Website
            from app.models.user import User
            site_result = await self.db.execute(select(Website).where(Website.id == website_id))
            site = site_result.scalar_one_or_none()
            user_result = await self.db.execute(select(User).where(User.id == monitor.user_id))
            user = user_result.scalar_one_or_none()
            if not user:
                continue

            for ev in events:
                await self._dispatch_keyword_monitor_notification(
                    monitor=monitor,
                    user=user,
                    site_domain=site.domain if site else str(website_id),
                    website_id=website_id,
                    kw_query=kw_query,
                    ev=ev,
                )

    async def _dispatch_keyword_monitor_notification(
        self, monitor: MonitoredKeyword, user, site_domain: str,
        website_id: int, kw_query: str, ev: Dict
    ):
        from app.services.email_service import send_alert_email
        from app.services.telegram_service import send_telegram_message

        label = ev["label"]
        emoji = ev["emoji"]
        old_pos = ev["old"]
        new_pos = ev["new"]
        dashboard_url = f"http://localhost:3000/websites/{website_id}/keywords"

        recipient_email = getattr(user, "alert_email", None) or user.email
        if "email" in (monitor.channels or []) and recipient_email:
            subject = f"{emoji} {label} — {kw_query}"
            html = f"""
            <html><body style="font-family:sans-serif;padding:20px;color:#333">
            <h2 style="color:#2563eb">{emoji} Alerte mot-clé : {label}</h2>
            <table style="border-collapse:collapse;width:100%;max-width:600px">
              <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9"><b>Site</b></td><td style="padding:8px;border:1px solid #ddd">{site_domain}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9"><b>Mot-clé</b></td><td style="padding:8px;border:1px solid #ddd"><b>{kw_query}</b></td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9"><b>Position précédente</b></td><td style="padding:8px;border:1px solid #ddd">#{old_pos:.0f}</td></tr>
              <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9"><b>Nouvelle position</b></td><td style="padding:8px;border:1px solid #ddd"><b>#{new_pos:.0f}</b></td></tr>
            </table>
            <p style="margin-top:20px">
              <a href="{dashboard_url}" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:4px">Voir le tableau de bord</a>
            </p>
            </body></html>
            """
            try:
                await send_alert_email(recipient_email, subject, html)
            except Exception:
                pass

        if "telegram" in (monitor.channels or []) and user.telegram_chat_id:
            msg = (
                f"{emoji} *{label}*\n"
                f"*Site :* {site_domain}\n"
                f"*Mot-clé :* `{kw_query}`\n"
                f"*Position précédente :* #{old_pos:.0f}\n"
                f"*Nouvelle position :* #{new_pos:.0f}\n"
                f"[Voir le dashboard]({dashboard_url})"
            )
            try:
                await send_telegram_message(user.telegram_chat_id, msg)
            except Exception:
                pass

    async def _dispatch_notifications(self, rule: AlertRule, event: AlertEvent, context: Dict[str, Any]):
        from app.services.email_service import send_alert_email, build_alert_email_html, build_alert_subject
        from app.services.telegram_service import send_telegram_message, build_alert_telegram_message
        from app.config import settings
        from sqlalchemy import select
        from app.models.user import User
        from app.models.website import Website

        user_result = await self.db.execute(select(User).where(User.id == rule.user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            return

        site_result = await self.db.execute(select(Website).where(Website.id == event.website_id))
        site = site_result.scalar_one_or_none()

        site_domain = site.domain if site else str(event.website_id)
        detected_at_fr = event.fired_at.strftime("%d/%m/%Y à %H:%M") if event.fired_at else ""

        ctx = {
            "site": site_domain,
            "metric": rule.metric,
            "raw_context": context or {},
            "detected_at": detected_at_fr,
            "dashboard_url": f"{settings.FRONTEND_URL.rstrip('/')}/sites/{event.website_id}",
        }

        recipient_email = getattr(user, "alert_email", None) or user.email

        if "email" in rule.channels and recipient_email:
            try:
                html = build_alert_email_html(ctx)
                subject = build_alert_subject(rule.metric, site_domain)
                await send_alert_email(recipient_email, subject, html)
            except Exception:
                pass

        if "telegram" in rule.channels and user.telegram_chat_id:
            try:
                msg = build_alert_telegram_message(ctx)
                await send_telegram_message(user.telegram_chat_id, msg)
            except Exception:
                pass

    async def dispatch_http_monitor_alert(self, monitor: HTTPMonitor, result: Dict[str, Any], prev_code: Optional[int]):
        """Send notification for HTTP monitor based on its own channel config."""
        from app.models.user import User
        from app.models.website import Website
        from app.services.notification_service import send_alert_email, send_telegram_message

        status_code = result.get("status_code")
        is_error = result.get("is_error", False)
        response_time = result.get("response_time")
        is_redirect = status_code is not None and 300 <= status_code < 400
        is_slow = monitor.notify_on_slow and response_time is not None and response_time > monitor.slow_threshold_ms

        should_notify = False
        reason = ""

        if monitor.notify_on_error and is_error:
            # Only notify on NEW errors (was OK before, now error)
            prev_was_ok = prev_code is None or prev_code < 400
            if prev_was_ok:
                should_notify = True
                if status_code is None:
                    reason = "⏱️ Timeout — page inaccessible"
                elif status_code >= 500:
                    reason = f"🔴 Erreur serveur {status_code}"
                else:
                    reason = f"🟠 Erreur client {status_code}"

        if monitor.notify_on_redirect and is_redirect and not should_notify:
            prev_was_not_redirect = prev_code is None or not (300 <= prev_code < 400)
            if prev_was_not_redirect:
                should_notify = True
                reason = f"🔀 Redirection détectée → {result.get('redirect_url', '?')} ({status_code})"

        if is_slow and not should_notify:
            should_notify = True
            reason = f"🐢 Réponse lente : {response_time:.0f}ms (seuil : {monitor.slow_threshold_ms}ms)"

        if not should_notify or not monitor.channels:
            return

        user_result = await self.db.execute(select(User).where(User.id == monitor.user_id))
        user = user_result.scalar_one_or_none()
        site_result = await self.db.execute(select(Website).where(Website.id == monitor.website_id))
        site = site_result.scalar_one_or_none()
        if not user or not site:
            return

        url_display = monitor.url.replace("https://", "").replace("http://", "")
        dashboard_url = f"http://localhost:3000/websites/{monitor.website_id}/http-checks"

        if "email" in monitor.channels and user.email:
            try:
                html = f"""
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:#ef4444;padding:20px 24px;border-radius:8px 8px 0 0">
                    <h2 style="color:white;margin:0">🚨 Alerte HTTP — {site.domain}</h2>
                  </div>
                  <div style="background:#fff;border:1px solid #fecaca;padding:24px;border-radius:0 0 8px 8px">
                    <p style="font-size:16px;color:#111">{reason}</p>
                    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0">
                      <p style="margin:0;font-weight:600;color:#7f1d1d">{url_display}</p>
                      <p style="margin:4px 0 0;color:#991b1b;font-size:13px">Code HTTP : <strong>{status_code or 'N/A'}</strong></p>
                    </div>
                    <a href="{dashboard_url}" style="display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
                      Voir le tableau de bord →
                    </a>
                  </div>
                </div>"""
                await send_alert_email(user.email, f"Alerte HTTP : {url_display}", html)
            except Exception:
                pass

        if "telegram" in monitor.channels and user.telegram_chat_id:
            try:
                msg = (
                    f"🚨 *Alerte HTTP — {site.domain}*\n\n"
                    f"{reason}\n"
                    f"URL : `{url_display}`\n"
                    f"Code : `{status_code or 'N/A'}`\n\n"
                    f"[Voir le tableau de bord]({dashboard_url})"
                )
                await send_telegram_message(user.telegram_chat_id, msg)
            except Exception:
                pass

    async def dispatch_indexation_monitor_alert(
        self, monitor: "IndexationMonitor", new_state, prev_state
    ):
        """Fire alert when coverage state changes for a monitored URL."""
        from app.models.user import User
        from app.models.website import Website
        from app.services.notification_service import send_alert_email, send_telegram_message

        if not new_state or new_state == prev_state:
            return

        NOT_INDEXED = {"CRAWLED_CURRENTLY_NOT_INDEXED", "DISCOVERED_CURRENTLY_NOT_INDEXED", "NOT_INDEXED"}
        BLOCKED = {"BLOCKED_BY_ROBOTS_TXT", "BLOCKED_BY_META_TAG", "BLOCKED_BY_HTTP_HEADER"}
        INDEXED = {"SUBMITTED_AND_INDEXED", "INDEXED_NOT_SUBMITTED_IN_SITEMAP"}

        STATE_LABELS_FR = {
            "SUBMITTED_AND_INDEXED": "Soumis et indexé ✅",
            "INDEXED_NOT_SUBMITTED_IN_SITEMAP": "Indexé (hors sitemap) ✅",
            "CRAWLED_CURRENTLY_NOT_INDEXED": "Explorée, actuellement non indexée ⚠️",
            "DISCOVERED_CURRENTLY_NOT_INDEXED": "Détectée, actuellement non indexée ⚠️",
            "NOT_INDEXED": "Non indexée ⚠️",
            "BLOCKED_BY_ROBOTS_TXT": "Bloquée par robots.txt 🔴",
            "BLOCKED_BY_META_TAG": "Bloquée par balise meta 🔴",
            "BLOCKED_BY_HTTP_HEADER": "Bloquée par en-tête HTTP 🔴",
            "PAGE_WITH_REDIRECT": "Page avec redirection 🔀",
            "ALTERNATE_PAGE": "Page alternative",
            "DUPLICATE_WITHOUT_CANONICAL": "Dupliquée sans canonique ⚠️",
            "DUPLICATE_WITH_PROPER_CANONICAL": "Dupliquée avec canonique valide",
        }

        should_notify = False
        reason = ""
        severity_color = "#f59e0b"

        if monitor.notify_not_indexed and new_state in NOT_INDEXED:
            prev_was_indexed_or_unknown = prev_state is None or prev_state in INDEXED
            if prev_was_indexed_or_unknown:
                should_notify = True
                severity_color = "#f59e0b"
                if new_state == "CRAWLED_CURRENTLY_NOT_INDEXED":
                    reason = "⚠️ La page a été explorée mais n'est plus indexée par Google"
                elif new_state == "DISCOVERED_CURRENTLY_NOT_INDEXED":
                    reason = "⚠️ La page a été détectée mais n'est pas encore indexée"
                else:
                    reason = "⚠️ La page n'est plus indexée"

        if monitor.notify_blocked and new_state in BLOCKED and not should_notify:
            prev_not_blocked = prev_state is None or prev_state not in BLOCKED
            if prev_not_blocked:
                should_notify = True
                severity_color = "#ef4444"
                if new_state == "BLOCKED_BY_ROBOTS_TXT":
                    reason = "🔴 La page est bloquée par robots.txt"
                elif new_state == "BLOCKED_BY_META_TAG":
                    reason = "🔴 La page est bloquée par une balise meta (noindex)"
                else:
                    reason = "🔴 La page est bloquée par un en-tête HTTP"

        if monitor.notify_recovered and new_state in INDEXED and not should_notify:
            prev_was_bad = prev_state is not None and prev_state not in INDEXED
            if prev_was_bad:
                should_notify = True
                severity_color = "#22c55e"
                reason = "✅ La page est à nouveau indexée par Google"

        if not should_notify or not monitor.channels:
            return

        user_result = await self.db.execute(select(User).where(User.id == monitor.user_id))
        user = user_result.scalar_one_or_none()
        site_result = await self.db.execute(select(Website).where(Website.id == monitor.website_id))
        site = site_result.scalar_one_or_none()
        if not user or not site:
            return

        url_display = monitor.url.replace("https://", "").replace("http://", "")
        dashboard_url = f"http://localhost:3000/websites/{monitor.website_id}/indexation"
        new_label = STATE_LABELS_FR.get(new_state, new_state)
        prev_label = STATE_LABELS_FR.get(prev_state, prev_state) if prev_state else "Inconnu"

        if "email" in monitor.channels and user.email:
            try:
                html = f"""
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                  <div style="background:{severity_color};padding:20px 24px;border-radius:8px 8px 0 0">
                    <h2 style="color:white;margin:0">Alerte Indexation — {site.domain}</h2>
                  </div>
                  <div style="background:#fff;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 8px 8px">
                    <p style="font-size:16px;color:#111">{reason}</p>
                    <div style="background:#f9fafb;border-left:4px solid {severity_color};padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0">
                      <p style="margin:0;font-weight:600;color:#111">{url_display}</p>
                      <p style="margin:6px 0 0;font-size:13px;color:#374151">
                        Avant : <strong>{prev_label}</strong><br>
                        Maintenant : <strong>{new_label}</strong>
                      </p>
                    </div>
                    <a href="{dashboard_url}" style="display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
                      Voir l&apos;indexation →
                    </a>
                  </div>
                </div>"""
                await send_alert_email(user.email, f"Alerte Indexation : {url_display}", html)
            except Exception:
                pass

        if "telegram" in monitor.channels and user.telegram_chat_id:
            try:
                msg = (
                    f"🔍 *Alerte Indexation — {site.domain}*\n\n"
                    f"{reason}\n\n"
                    f"URL : `{url_display}`\n"
                    f"Avant : {prev_label}\n"
                    f"Maintenant : *{new_label}*\n\n"
                    f"[Voir l'indexation]({dashboard_url})"
                )
                await send_telegram_message(user.telegram_chat_id, msg)
            except Exception:
                pass

    async def dispatch_backlink_monitor_alert(self, monitor, backlink, alert_type: str):
        """
        alert_type: "suspicious" | "new"
        """
        from app.models.website import Website
        from app.models.user import User
        from app.services.email_service import send_alert_email
        from app.services.telegram_service import send_telegram_message

        site_r = await self.db.execute(select(Website).where(Website.id == monitor.website_id))
        site = site_r.scalar_one_or_none()
        user_r = await self.db.execute(select(User).where(User.id == monitor.user_id))
        user = user_r.scalar_one_or_none()
        if not site or not user:
            return

        dashboard_url = f"https://app.seo-monitor.com/websites/{site.id}/links"
        dr = int(float(backlink.domain_rating)) if backlink.domain_rating else 0
        target_display = monitor.target[:60]
        source_display = backlink.url_from[:80] if backlink.url_from else "—"
        anchor = backlink.anchor_text or "(vide)"

        if alert_type == "suspicious":
            subject = f"⚠️ Backlink suspect détecté — {site.domain}"
            reasons_html = "".join(
                f"<li style='margin:2px 0;color:#dc2626;'>{r}</li>"
                for r in (backlink.suspicious_reason or "").split(" | ")
                if r
            )
            html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;">
  <h2 style="color:#dc2626;">⚠️ Backlink suspect détecté</h2>
  <p style="color:#374151;">Un backlink potentiellement toxique a été détecté vers <strong>{target_display}</strong> sur <strong>{site.domain}</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px;background:#f9fafb;font-weight:600;width:160px;">Source</td><td style="padding:8px;">{source_display}</td></tr>
    <tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Anchor text</td><td style="padding:8px;font-style:italic;">"{anchor}"</td></tr>
    <tr><td style="padding:8px;background:#f9fafb;font-weight:600;">DR source</td><td style="padding:8px;">{dr}</td></tr>
    <tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Raisons</td><td style="padding:8px;"><ul style="margin:0;padding-left:16px;">{reasons_html}</ul></td></tr>
  </table>
  <p style="color:#6b7280;font-size:13px;">Vérifiez si ce lien doit être désavoué via Google Search Console.</p>
  <a href="{dashboard_url}" style="display:inline-block;padding:10px 20px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;font-weight:600;">Voir les backlinks</a>
</div>"""
            tg_msg = (
                f"⚠️ *Backlink suspect — {site.domain}*\n\n"
                f"🔗 Source : `{source_display}`\n"
                f"🎯 Cible : `{target_display}`\n"
                f"⚓ Anchor : _{anchor}_\n"
                f"📊 DR : {dr}\n\n"
                f"🚨 *Raisons :*\n" +
                "\n".join(f"• {r}" for r in (backlink.suspicious_reason or "").split(" | ") if r) +
                f"\n\n[Voir les backlinks]({dashboard_url})"
            )
        else:
            subject = f"🔗 Nouveau backlink — {site.domain}"
            html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;">
  <h2 style="color:#2563eb;">🔗 Nouveau backlink détecté</h2>
  <p style="color:#374151;">Un nouveau lien entrant a été détecté vers <strong>{target_display}</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px;background:#f9fafb;font-weight:600;width:160px;">Source</td><td style="padding:8px;">{source_display}</td></tr>
    <tr><td style="padding:8px;background:#f9fafb;font-weight:600;">Anchor text</td><td style="padding:8px;font-style:italic;">"{anchor}"</td></tr>
    <tr><td style="padding:8px;background:#f9fafb;font-weight:600;">DR source</td><td style="padding:8px;">{dr}</td></tr>
  </table>
  <a href="{dashboard_url}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;font-weight:600;">Voir les backlinks</a>
</div>"""
            tg_msg = (
                f"🔗 *Nouveau backlink — {site.domain}*\n\n"
                f"Source : `{source_display}`\n"
                f"Anchor : _{anchor}_\n"
                f"DR : {dr}\n\n"
                f"[Voir les backlinks]({dashboard_url})"
            )

        if "email" in monitor.channels and user.email:
            try:
                await send_alert_email(user.email, subject, html)
            except Exception:
                pass

        if "telegram" in monitor.channels and user.telegram_chat_id:
            try:
                await send_telegram_message(user.telegram_chat_id, tg_msg)
            except Exception:
                pass

    async def dispatch_seo_monitor_alert(
        self, monitor: "SEOMonitor", changes: list
    ):
        """Fire alert when SEO changes are detected for a monitored URL."""
        from app.models.user import User
        from app.models.website import Website
        from app.services.notification_service import send_alert_email, send_telegram_message

        if not changes or not monitor.channels:
            return

        user_result = await self.db.execute(select(User).where(User.id == monitor.user_id))
        user = user_result.scalar_one_or_none()
        site_result = await self.db.execute(select(Website).where(Website.id == monitor.website_id))
        site = site_result.scalar_one_or_none()
        if not user or not site:
            return

        FIELD_LABELS = {
            "title": "Balise Title",
            "meta_description": "Meta Description",
            "h1": "Titre H1",
            "h2s": "Titres H2",
            "h3s": "Titres H3",
            "canonical": "URL Canonique",
            "robots_meta": "Meta Robots",
            "og_title": "OG Title",
            "og_description": "OG Description",
            "schema_types": "Schema Markup",
            "hreflang": "Hreflang",
            "links_count": "Nombre de liens",
            "images_without_alt": "Images sans Alt",
        }

        url_display = monitor.url.replace("https://", "").replace("http://", "")
        dashboard_url = f"http://localhost:3000/sites/{monitor.website_id}/changements-seo"
        change_count = len(changes)
        fields_changed = ", ".join(
            FIELD_LABELS.get(c["field"], c["field"]) for c in changes[:5]
        )
        if change_count > 5:
            fields_changed += f" (+{change_count - 5} autres)"

        if "email" in monitor.channels and user.email:
            try:
                rows_html = ""
                for c in changes[:10]:
                    label = FIELD_LABELS.get(c["field"], c["field"])
                    old_v = c.get("old_value") or "—"
                    new_v = c.get("new_value") or "—"
                    rows_html += f"""
                    <tr>
                      <td style="padding:8px 12px;font-weight:600;color:#374151;white-space:nowrap">{label}</td>
                      <td style="padding:8px 12px;color:#6b7280;font-size:12px;max-width:200px;word-break:break-word">{old_v[:200]}</td>
                      <td style="padding:8px 12px;color:#059669;font-size:12px;max-width:200px;word-break:break-word">{new_v[:200]}</td>
                    </tr>"""

                html = f"""
                <div style="font-family:sans-serif;max-width:640px;margin:0 auto">
                  <div style="background:#f59e0b;padding:20px 24px;border-radius:8px 8px 0 0">
                    <h2 style="color:white;margin:0">🔍 Changement SEO détecté — {site.domain}</h2>
                  </div>
                  <div style="background:#fff;border:1px solid #fde68a;padding:24px;border-radius:0 0 8px 8px">
                    <p style="font-size:15px;color:#111;margin:0 0 4px">
                      <strong>{change_count} changement{'s' if change_count > 1 else ''}</strong> détecté{'s' if change_count > 1 else ''} sur :
                    </p>
                    <p style="font-size:13px;color:#6b7280;margin:0 0 16px">{monitor.url}</p>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
                      <thead>
                        <tr style="background:#f9fafb">
                          <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase">Élément</th>
                          <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase">Avant</th>
                          <th style="padding:8px 12px;text-align:left;color:#059669;font-size:11px;text-transform:uppercase">Après</th>
                        </tr>
                      </thead>
                      <tbody>{rows_html}</tbody>
                    </table>
                    <div style="margin-top:20px">
                      <a href="{dashboard_url}" style="display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
                        Voir les détails →
                      </a>
                    </div>
                  </div>
                </div>"""
                subject = f"Changement SEO : {url_display} ({change_count} élément{'s' if change_count > 1 else ''})"
                await send_alert_email(user.email, subject, html)
            except Exception:
                pass

        if "telegram" in monitor.channels and user.telegram_chat_id:
            try:
                lines = [f"🔍 *Changement SEO — {site.domain}*\n"]
                lines.append(f"URL : `{url_display}`")
                lines.append(f"*{change_count} changement{'s' if change_count > 1 else ''} détecté{'s' if change_count > 1 else ''} :*\n")
                for c in changes[:8]:
                    label = FIELD_LABELS.get(c["field"], c["field"])
                    old_v = (c.get("old_value") or "—")[:80]
                    new_v = (c.get("new_value") or "—")[:80]
                    lines.append(f"• *{label}*\n  ~~{old_v}~~\n  → {new_v}")
                if change_count > 8:
                    lines.append(f"_…et {change_count - 8} autre(s)_")
                lines.append(f"\n[Voir le tableau de bord]({dashboard_url})")
                await send_telegram_message(user.telegram_chat_id, "\n".join(lines))
            except Exception:
                pass
