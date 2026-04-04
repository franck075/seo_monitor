from datetime import date
from sqlalchemy import select
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.models.monitoring import TrafficSnapshot
from app.models.user import UserAPICredential
from app.core.crypto import decrypt_credentials


async def _pull_traffic_for_site(website_id: int, days: int = 7):
    factory = get_sync_session()
    async with factory() as db:
        result = await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))
        website = result.scalar_one_or_none()
        if not website or not website.ga4_property_id or not website.ga4_cred_id:
            return

        cred_result = await db.execute(select(UserAPICredential).where(UserAPICredential.id == website.ga4_cred_id))
        cred = cred_result.scalar_one_or_none()
        if not cred:
            return

        credentials_json = decrypt_credentials(cred.credentials_enc)

        from app.services.ga4_service import GA4Service
        ga4 = GA4Service(credentials_json=credentials_json, property_id=website.ga4_property_id)
        rows = ga4.get_organic_traffic(days=days)

        for row in rows:
            try:
                day = date.fromisoformat(row["date"].replace(":", "-")[:10])
            except Exception:
                day = date.today()

            existing = await db.execute(
                select(TrafficSnapshot).where(
                    TrafficSnapshot.website_id == website_id,
                    TrafficSnapshot.recorded_date == day,
                    TrafficSnapshot.source == "organic",
                )
            )
            snap = existing.scalar_one_or_none()
            if snap:
                snap.sessions = row["sessions"]
                snap.users = row["users"]
                snap.new_users = row["new_users"]
                snap.pageviews = row["pageviews"]
                snap.bounce_rate = row["bounce_rate"]
                snap.avg_session_duration = row["avg_session_duration"]
            else:
                db.add(TrafficSnapshot(
                    website_id=website_id,
                    recorded_date=day,
                    sessions=row["sessions"],
                    users=row["users"],
                    new_users=row["new_users"],
                    pageviews=row["pageviews"],
                    bounce_rate=row["bounce_rate"],
                    avg_session_duration=row["avg_session_duration"],
                    source="organic",
                ))
        await db.commit()

        try:
            from app.services.alert_service import AlertService
            alert_svc = AlertService(db)
            await alert_svc.evaluate_all_for_website(website_id)
            await db.commit()
        except Exception:
            pass


@celery_app.task(name="app.tasks.traffic_tasks.pull_traffic_for_site", bind=True, max_retries=3)
def pull_traffic_for_site(self, website_id: int, days: int = 7):
    try:
        run_async(_pull_traffic_for_site(website_id, days=days))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.traffic_tasks.backfill_traffic_for_site", bind=True, max_retries=2)
def backfill_traffic_for_site(self, website_id: int, days: int = 90):
    try:
        run_async(_pull_traffic_for_site(website_id, days=days))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.traffic_tasks.pull_traffic_all_sites")
def pull_traffic_all_sites():
    async def _get_ids():
        factory = get_sync_session()
        async with factory() as db:
            result = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in result.all()]

    for site_id in run_async(_get_ids()):
        pull_traffic_for_site.delay(site_id)
