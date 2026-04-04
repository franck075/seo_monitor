from datetime import datetime, timezone
from sqlalchemy import select
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.models.monitoring import IndexationMonitor, IndexationError
from app.models.user import UserAPICredential
from app.core.crypto import decrypt_credentials

# Coverage states that mean "not indexed"
NOT_INDEXED_STATES = {
    "CRAWLED_CURRENTLY_NOT_INDEXED",
    "DISCOVERED_CURRENTLY_NOT_INDEXED",
    "NOT_INDEXED",
    "PAGE_WITH_REDIRECT",
    "ALTERNATE_PAGE",
    "DUPLICATE_WITHOUT_CANONICAL",
    "DUPLICATE_WITH_PROPER_CANONICAL",
}

BLOCKED_STATES = {
    "BLOCKED_BY_ROBOTS_TXT",
    "BLOCKED_BY_META_TAG",
    "BLOCKED_BY_HTTP_HEADER",
}

INDEXED_STATES = {
    "SUBMITTED_AND_INDEXED",
    "INDEXED_NOT_SUBMITTED_IN_SITEMAP",
}


def _is_not_indexed(state: str) -> bool:
    return state in NOT_INDEXED_STATES

def _is_blocked(state: str) -> bool:
    return state in BLOCKED_STATES

def _is_indexed(state: str) -> bool:
    return state in INDEXED_STATES


async def _inspect_url(website_id: int, url: str):
    factory = get_sync_session()
    async with factory() as db:
        # Load website + GSC credentials
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

        # Get monitor for this URL
        mon_result = await db.execute(
            select(IndexationMonitor).where(IndexationMonitor.website_id == website_id, IndexationMonitor.url == url)
        )
        monitor = mon_result.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        data = gsc.inspect_url(url)

        if data.get("error") and not data.get("coverage_state"):
            return

        coverage_state = data.get("coverage_state")
        indexing_state = data.get("indexing_state")
        robots_state = data.get("robots_txt_state")
        last_crawl_raw = data.get("last_crawl_time")
        last_crawl = None
        if last_crawl_raw:
            try:
                from dateutil import parser as dtparser
                last_crawl = dtparser.parse(last_crawl_raw)
            except Exception:
                pass

        # Save inspection result
        db.add(IndexationError(
            website_id=website_id,
            page_url=url,
            recorded_at=now,
            coverage_state=coverage_state,
            indexing_state=indexing_state,
            robots_state=robots_state,
            last_crawled=last_crawl,
            is_indexable=_is_indexed(coverage_state or ""),
            google_canonical=data.get("google_canonical"),
            user_canonical=data.get("user_canonical"),
        ))

        if monitor:
            prev_state = monitor.last_coverage_state

            try:
                from app.services.alert_service import AlertService
                alert_svc = AlertService(db)
                await alert_svc.dispatch_indexation_monitor_alert(monitor, coverage_state, prev_state)
            except Exception:
                pass

            monitor.last_coverage_state = coverage_state
            monitor.last_indexing_state = indexing_state
            monitor.last_robots_state = robots_state
            monitor.last_crawl_time = last_crawl
            monitor.last_checked_at = now

        await db.commit()


async def _inspect_all_for_site(website_id: int):
    factory = get_sync_session()
    async with factory() as db:
        result = await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))
        if not result.scalar_one_or_none():
            return
        mon_result = await db.execute(
            select(IndexationMonitor.url)
            .where(IndexationMonitor.website_id == website_id, IndexationMonitor.is_active == True)
        )
        urls = [r[0] for r in mon_result.all()]

    for url in urls:
        inspect_url.delay(website_id, url)


@celery_app.task(name="app.tasks.indexation_tasks.inspect_url", bind=True, max_retries=2)
def inspect_url(self, website_id: int, url: str):
    try:
        run_async(_inspect_url(website_id, url))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.indexation_tasks.inspect_all_for_site", bind=True, max_retries=2)
def inspect_all_for_site(self, website_id: int):
    try:
        run_async(_inspect_all_for_site(website_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.indexation_tasks.inspect_all_sites")
def inspect_all_sites():
    async def _get_ids():
        factory = get_sync_session()
        async with factory() as db:
            result = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in result.all()]

    for site_id in run_async(_get_ids()):
        inspect_all_for_site.delay(site_id)
