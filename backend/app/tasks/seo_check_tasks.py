from datetime import datetime, timezone
from sqlalchemy import select
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.models.monitoring import SEOSnapshot, SEOChange, SEOMonitor


async def _check_url(website_id: int, url: str):
    from app.services.seo_extractor_service import SEOExtractorService
    factory = get_sync_session()
    async with factory() as db:
        # Get monitor config for tracked fields
        mon_result = await db.execute(
            select(SEOMonitor).where(SEOMonitor.website_id == website_id, SEOMonitor.url == url)
        )
        monitor = mon_result.scalar_one_or_none()

        tracked_fields = None
        if monitor:
            tracked_fields = []
            if monitor.track_title: tracked_fields.append("title")
            if monitor.track_meta_desc: tracked_fields.append("meta_desc")
            if monitor.track_h1: tracked_fields.append("h1")
            if monitor.track_h2: tracked_fields.append("h2")
            if monitor.track_h3: tracked_fields.append("h3")
            if monitor.track_canonical: tracked_fields.append("canonical")
            if monitor.track_robots: tracked_fields.append("robots")
            if monitor.track_og: tracked_fields.append("og")
            if monitor.track_schema: tracked_fields.append("schema")
            if monitor.track_hreflang: tracked_fields.append("hreflang")
            if monitor.track_links_count: tracked_fields.append("links_count")
            if monitor.track_alt_text: tracked_fields.append("alt_text")

        svc = SEOExtractorService()
        now = datetime.now(timezone.utc)

        try:
            new_data = await svc.extract(url)
            if new_data.get("error"):
                return

            prev_result = await db.execute(
                select(SEOSnapshot).where(
                    SEOSnapshot.website_id == website_id,
                    SEOSnapshot.page_url == url,
                ).order_by(SEOSnapshot.recorded_at.desc()).limit(1)
            )
            prev = prev_result.scalar_one_or_none()

            new_snap = SEOSnapshot(
                website_id=website_id,
                page_url=url,
                recorded_at=now,
                title=new_data.get("title"),
                meta_description=new_data.get("meta_description"),
                h1=new_data.get("h1"),
                h2s=new_data.get("h2s"),
                h3s=new_data.get("h3s"),
                canonical=new_data.get("canonical"),
                robots_meta=new_data.get("robots_meta"),
                schema_types=new_data.get("schema_types"),
                og_title=new_data.get("og_title"),
                og_description=new_data.get("og_description"),
                hreflang=new_data.get("hreflang"),
                links_count=new_data.get("links_count"),
                images_without_alt=new_data.get("images_without_alt"),
                content_hash=new_data.get("content_hash"),
            )
            db.add(new_snap)
            await db.flush()

            if prev:
                prev_dict = {
                    "title": prev.title,
                    "meta_description": prev.meta_description,
                    "h1": prev.h1,
                    "h2s": prev.h2s,
                    "h3s": prev.h3s,
                    "canonical": prev.canonical,
                    "robots_meta": prev.robots_meta,
                    "og_title": prev.og_title,
                    "og_description": prev.og_description,
                    "schema_types": prev.schema_types,
                    "hreflang": prev.hreflang,
                    "links_count": prev.links_count,
                    "images_without_alt": prev.images_without_alt,
                }
                changes = svc.detect_changes(prev_dict, new_data, tracked_fields)
                for change in changes:
                    db.add(SEOChange(
                        website_id=website_id,
                        page_url=url,
                        detected_at=now,
                        field=change["field"],
                        old_value=str(change["old_value"]) if change["old_value"] is not None else None,
                        new_value=str(change["new_value"]) if change["new_value"] is not None else None,
                        snapshot_before=prev.id,
                        snapshot_after=new_snap.id,
                    ))

            # Update last_checked_at on monitor
            if monitor:
                monitor.last_checked_at = now

            await db.commit()

            # Send per-monitor notifications if changes were found
            if changes and monitor and monitor.channels:
                try:
                    from app.services.alert_service import AlertService
                    alert_svc = AlertService(db)
                    change_dicts = [
                        {
                            "field": c["field"],
                            "old_value": str(c["old_value"]) if c["old_value"] is not None else None,
                            "new_value": str(c["new_value"]) if c["new_value"] is not None else None,
                        }
                        for c in changes
                    ]
                    await alert_svc.dispatch_seo_monitor_alert(monitor, change_dicts)
                except Exception:
                    pass

        except Exception:
            pass


async def _check_seo_for_site(website_id: int):
    factory = get_sync_session()
    async with factory() as db:
        result = await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))
        website = result.scalar_one_or_none()
        if not website:
            return

        # Use SEOMonitor URLs; fallback to homepage if none configured
        mon_result = await db.execute(
            select(SEOMonitor.url)
            .where(SEOMonitor.website_id == website_id, SEOMonitor.is_active == True)
            .order_by(SEOMonitor.created_at)
        )
        urls = [r[0] for r in mon_result.all()]
        if not urls:
            return  # no monitors configured, nothing to do

    for url in urls:
        check_seo_for_url.delay(website_id, url)


@celery_app.task(name="app.tasks.seo_check_tasks.check_seo_for_url", bind=True, max_retries=2)
def check_seo_for_url(self, website_id: int, url: str):
    try:
        run_async(_check_url(website_id, url))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.seo_check_tasks.check_seo_for_site", bind=True, max_retries=2)
def check_seo_for_site(self, website_id: int):
    try:
        run_async(_check_seo_for_site(website_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.seo_check_tasks.check_seo_all_sites")
def check_seo_all_sites():
    async def _get_ids():
        factory = get_sync_session()
        async with factory() as db:
            result = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in result.all()]

    for site_id in run_async(_get_ids()):
        check_seo_for_site.delay(site_id)
