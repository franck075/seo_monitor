from datetime import datetime, timezone
from sqlalchemy import select
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.core.url_utils import domain_to_url
from app.models.monitoring import HTTPCheck, HTTPMonitor


async def _run_check(website_id: int, url: str):
    from app.services.http_service import HTTPService
    factory = get_sync_session()
    async with factory() as db:
        svc = HTTPService()
        now = datetime.now(timezone.utc)

        r = await svc.check_url(url)

        check = HTTPCheck(
            website_id=website_id,
            page_url=url,
            checked_at=now,
            status_code=r["status_code"],
            redirect_url=r.get("redirect_url"),
            redirect_chain=r.get("redirect_chain"),
            response_time=r.get("response_time"),
            is_error=r.get("is_error", False),
        )
        db.add(check)

        # Update monitor's cached status
        mon_result = await db.execute(
            select(HTTPMonitor).where(HTTPMonitor.website_id == website_id, HTTPMonitor.url == url)
        )
        monitor = mon_result.scalar_one_or_none()
        if monitor:
            prev_code = monitor.last_status_code
            monitor.last_status_code = r["status_code"]
            monitor.last_response_time = r.get("response_time")
            monitor.last_checked_at = now

            # Per-monitor alert: notify on error transition or slow response
            await db.flush()
            try:
                from app.services.alert_service import AlertService
                alert_svc = AlertService(db)
                await alert_svc.dispatch_http_monitor_alert(monitor, r, prev_code)
            except Exception:
                pass

        await db.commit()


async def _check_http_for_site(website_id: int):
    factory = get_sync_session()
    async with factory() as db:
        result = await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))
        website = result.scalar_one_or_none()
        if not website:
            return

        mon_result = await db.execute(
            select(HTTPMonitor.url)
            .where(HTTPMonitor.website_id == website_id, HTTPMonitor.is_active == True)
        )
        urls = [r[0] for r in mon_result.all()]

        # Fallback to homepage if no monitors configured
        if not urls:
            urls = [domain_to_url(website.domain)]

    for url in urls:
        check_http_for_url.delay(website_id, url)


@celery_app.task(name="app.tasks.http_check_tasks.check_http_for_url", bind=True, max_retries=2)
def check_http_for_url(self, website_id: int, url: str):
    try:
        run_async(_run_check(website_id, url))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="app.tasks.http_check_tasks.check_http_for_site", bind=True, max_retries=3)
def check_http_for_site(self, website_id: int):
    try:
        run_async(_check_http_for_site(website_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="app.tasks.http_check_tasks.check_http_all_sites")
def check_http_all_sites():
    async def _get_ids():
        factory = get_sync_session()
        async with factory() as db:
            result = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in result.all()]

    for site_id in run_async(_get_ids()):
        check_http_for_site.delay(site_id)
