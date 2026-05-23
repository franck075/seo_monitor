import logging
from datetime import datetime, timezone
from sqlalchemy import select
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.core.url_utils import domain_to_url
from app.models.monitoring import CoreWebVital, MonitoredPage
import asyncio

logger = logging.getLogger(__name__)


async def _pull_vitals_for_site(website_id: int):
    factory = get_sync_session()
    async with factory() as db:
        result = await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))
        website = result.scalar_one_or_none()
        if not website:
            return

        # Use monitored pages first, fallback to homepage
        pages_result = await db.execute(
            select(MonitoredPage.url)
            .where(MonitoredPage.website_id == website_id, MonitoredPage.is_active == True)
            .order_by(MonitoredPage.created_at)
        )
        page_urls = [r[0] for r in pages_result.all()]
        if not page_urls:
            page_urls = [domain_to_url(website.domain)]

        from app.services.pagespeed_service import PageSpeedService
        svc = PageSpeedService()

        for url in page_urls:
            for strategy in ["mobile", "desktop"]:
                try:
                    data = await svc.get_vitals(url, strategy)
                    db.add(CoreWebVital(
                        website_id=website_id,
                        page_url=url,
                        strategy=strategy,
                        recorded_at=datetime.now(timezone.utc),
                        lcp=data.get("lcp"),
                        cls=data.get("cls"),
                        inp=data.get("inp"),
                        ttfb=data.get("ttfb"),
                        fcp=data.get("fcp"),
                        performance_score=data.get("performance_score"),
                        lcp_rating=data.get("lcp_rating"),
                        cls_rating=data.get("cls_rating"),
                        inp_rating=data.get("inp_rating"),
                        ttfb_rating=data.get("ttfb_rating"),
                    ))
                    await asyncio.sleep(3)
                except Exception:
                    logger.exception("PageSpeed scan failed for %s (%s)", url, strategy)

        await db.commit()

        try:
            from app.services.alert_service import AlertService
            alert_svc = AlertService(db)
            await alert_svc.evaluate_all_for_website(website_id)
            await db.commit()
        except Exception:
            pass


async def _scan_single_url(website_id: int, url: str):
    """Scan one URL (mobile + desktop) and save results."""
    from app.services.pagespeed_service import PageSpeedService
    factory = get_sync_session()
    async with factory() as db:
        svc = PageSpeedService()
        for strategy in ["mobile", "desktop"]:
            try:
                data = await svc.get_vitals(url, strategy)
                db.add(CoreWebVital(
                    website_id=website_id,
                    page_url=url,
                    strategy=strategy,
                    recorded_at=datetime.now(timezone.utc),
                    lcp=data.get("lcp"),
                    cls=data.get("cls"),
                    inp=data.get("inp"),
                    ttfb=data.get("ttfb"),
                    fcp=data.get("fcp"),
                    performance_score=data.get("performance_score"),
                    lcp_rating=data.get("lcp_rating"),
                    cls_rating=data.get("cls_rating"),
                    inp_rating=data.get("inp_rating"),
                    ttfb_rating=data.get("ttfb_rating"),
                ))
                logger.info("PageSpeed scan OK for %s (%s) — score=%s", url, strategy, data.get("performance_score"))
                await asyncio.sleep(2)
            except Exception:
                logger.exception("PageSpeed scan failed for %s (%s)", url, strategy)
        await db.commit()


@celery_app.task(name="app.tasks.vitals_tasks.scan_page_url", bind=True, max_retries=2)
def scan_page_url(self, website_id: int, url: str):
    """Trigger an immediate scan for a single page URL."""
    try:
        run_async(_scan_single_url(website_id, url))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="app.tasks.vitals_tasks.pull_vitals_for_site", bind=True, max_retries=2)
def pull_vitals_for_site(self, website_id: int):
    try:
        run_async(_pull_vitals_for_site(website_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.vitals_tasks.pull_vitals_all_sites")
def pull_vitals_all_sites():
    async def _get_ids():
        factory = get_sync_session()
        async with factory() as db:
            result = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in result.all()]

    for site_id in run_async(_get_ids()):
        pull_vitals_for_site.delay(site_id)
