from datetime import datetime, timezone, date, timedelta
from sqlalchemy import select
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.models.keyword import Keyword, KeywordPosition
from app.models.user import UserAPICredential
from app.core.crypto import decrypt_credentials


async def _upsert_keyword_positions(db, website_id: int, rows: list):
    """Upsert keyword positions from GSC rows.

    GSC API is called with dimensions=["date","query"] so each row already contains
    the aggregated metrics for (date, query) across all pages — exactly matching
    what Google Search Console's Queries tab shows. No manual aggregation needed.
    """
    for row in rows:
        try:
            row_date = date.fromisoformat(row["date"])
        except Exception:
            row_date = date.today()

        query = row.get("query", "").strip()
        if not query:
            continue

        total_clicks = int(row.get("clicks", 0))
        total_impressions = int(row.get("impressions", 0))
        position = float(row.get("position", 0.0))
        ctr = total_clicks / total_impressions if total_impressions > 0 else 0.0

        kw_result = await db.execute(
            select(Keyword).where(Keyword.website_id == website_id, Keyword.query == query)
        )
        keyword = kw_result.scalar_one_or_none()
        if not keyword:
            keyword = Keyword(website_id=website_id, query=query, page=row.get("page"))
            db.add(keyword)
            await db.flush()

        pos_result = await db.execute(
            select(KeywordPosition).where(
                KeywordPosition.keyword_id == keyword.id,
                KeywordPosition.recorded_date == row_date,
            )
        )
        existing = pos_result.scalar_one_or_none()
        if existing:
            existing.position = position
            existing.clicks = total_clicks
            existing.impressions = total_impressions
            existing.ctr = ctr
        else:
            db.add(KeywordPosition(
                keyword_id=keyword.id,
                website_id=website_id,
                recorded_date=row_date,
                position=position,
                clicks=total_clicks,
                impressions=total_impressions,
                ctr=ctr,
            ))


async def _pull_keywords_for_site(website_id: int):
    """Pull exact daily keyword data for the last 3 days (GSC ~3 day delay)."""
    factory = get_sync_session()
    async with factory() as db:
        result = await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))
        website = result.scalar_one_or_none()
        if not website or not website.gsc_property or not website.gsc_cred_id:
            return

        cred_result = await db.execute(select(UserAPICredential).where(UserAPICredential.id == website.gsc_cred_id))
        cred = cred_result.scalar_one_or_none()
        if not cred:
            return

        credentials_json = decrypt_credentials(cred.credentials_enc)

        from app.services.gsc_service import GSCService
        gsc = GSCService(credentials_json=credentials_json, site_url=website.gsc_property)

        # GSC dataState="all" — fetch up to today
        end = date.today()
        start = end - timedelta(days=6)
        rows = gsc.get_keyword_positions_daily(
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
        )

        await _upsert_keyword_positions(db, website_id, rows)
        await db.commit()

        try:
            from app.services.alert_service import AlertService
            alert_svc = AlertService(db)
            await alert_svc.evaluate_all_for_website(website_id)
            await alert_svc.evaluate_monitored_keywords(website_id)
            await db.commit()
        except Exception:
            pass


@celery_app.task(name="app.tasks.keyword_tasks.pull_keywords_for_site", bind=True, max_retries=3)
def pull_keywords_for_site(self, website_id: int):
    try:
        run_async(_pull_keywords_for_site(website_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


async def _backfill_keywords_for_site(website_id: int, months: int = 6):
    """Pull daily keyword positions for the last N months, week by week."""
    factory = get_sync_session()
    async with factory() as db:
        result = await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))
        website = result.scalar_one_or_none()
        if not website or not website.gsc_property or not website.gsc_cred_id:
            return

        cred_result = await db.execute(select(UserAPICredential).where(UserAPICredential.id == website.gsc_cred_id))
        cred = cred_result.scalar_one_or_none()
        if not cred:
            return

        credentials_json = decrypt_credentials(cred.credentials_enc)

        from app.services.gsc_service import GSCService
        gsc = GSCService(credentials_json=credentials_json, site_url=website.gsc_property)

        today = date.today()
        end = today
        start = today - timedelta(days=months * 30)

        chunk_start = start
        while chunk_start <= end:
            chunk_end = min(chunk_start + timedelta(days=6), end)
            try:
                rows = gsc.get_keyword_positions_daily(
                    start_date=chunk_start.strftime("%Y-%m-%d"),
                    end_date=chunk_end.strftime("%Y-%m-%d"),
                )
                await _upsert_keyword_positions(db, website_id, rows)
                await db.commit()
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(
                    f"[backfill] website_id={website_id} chunk {chunk_start}→{chunk_end} failed: {e}"
                )
                await db.rollback()
            chunk_start = chunk_end + timedelta(days=1)


@celery_app.task(name="app.tasks.keyword_tasks.backfill_keywords_for_site", bind=True, max_retries=2)
def backfill_keywords_for_site(self, website_id: int, months: int = 6):
    try:
        run_async(_backfill_keywords_for_site(website_id, months))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.keyword_tasks.pull_keywords_all_sites")
def pull_keywords_all_sites():
    async def _get_site_ids():
        factory = get_sync_session()
        async with factory() as db:
            result = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in result.all()]

    site_ids = run_async(_get_site_ids())
    for site_id in site_ids:
        pull_keywords_for_site.delay(site_id)
