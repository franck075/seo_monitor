from datetime import datetime, timezone, date as date_type
from sqlalchemy import select
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.models.monitoring import SitemapSnapshot, SitemapURL
from app.core.url_utils import domain_to_url


# ── Sitemap URL discovery ──────────────────────────────────────────────────────

async def _discover_sitemap_url(base_url: str, website=None, db=None) -> str | None:
    """
    Discover the real sitemap URL using multiple strategies:
    1. robots.txt Sitemap: directive
    2. Common sitemap paths
    3. GSC API submitted sitemaps (if GSC configured)
    Returns the first working sitemap URL, or None.
    """
    import httpx
    from app.services.sitemap_service import SitemapService, HEADERS

    candidates = []

    # Strategy 1: robots.txt
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True, headers=HEADERS) as client:
            r = await client.get(f"{base_url}/robots.txt")
            if r.status_code == 200:
                for line in r.text.splitlines():
                    if line.lower().startswith("sitemap:"):
                        sitemap = line.split(":", 1)[1].strip()
                        if sitemap.startswith("http"):
                            candidates.append(sitemap)
    except Exception:
        pass

    # Strategy 2: common paths (only add if not already found via robots.txt)
    common_paths = [
        "/sitemap_index.xml",
        "/sitemap.xml",
        "/wp-sitemap.xml",
        "/sitemap-index.xml",
        "/sitemap/sitemap-index.xml",
    ]
    for path in common_paths:
        url = base_url.rstrip("/") + path
        if url not in candidates:
            candidates.append(url)

    # Strategy 3: GSC submitted sitemaps
    if website and db and website.gsc_cred_id and website.gsc_property:
        try:
            from app.models.user import UserAPICredential
            from app.core.crypto import decrypt_credentials
            from app.services.gsc_service import GSCService
            cred = (await db.execute(
                select(UserAPICredential).where(UserAPICredential.id == website.gsc_cred_id)
            )).scalar_one_or_none()
            if cred:
                creds_json = decrypt_credentials(cred.credentials_enc)
                gsc = GSCService(credentials_json=creds_json, site_url=website.gsc_property)
                response = gsc.service.sitemaps().list(siteUrl=website.gsc_property).execute()
                for sm in response.get("sitemap", []):
                    sm_url = sm.get("path", "")
                    if sm_url and sm_url.startswith("http") and sm_url not in candidates:
                        candidates.insert(0, sm_url)
        except Exception:
            pass

    # Quick reachability check in parallel (8s timeout per URL)
    import asyncio as _asyncio
    import httpx as _httpx

    async def _is_reachable(url: str) -> bool:
        try:
            async with _httpx.AsyncClient(timeout=8, follow_redirects=True, headers=HEADERS) as _c:
                r = await _c.head(url)
                return r.status_code < 500
        except Exception:
            return False

    reachable_flags = await _asyncio.gather(*[_is_reachable(u) for u in candidates])
    reachable = [u for u, ok in zip(candidates, reachable_flags) if ok]

    svc = SitemapService()
    for url in reachable:
        try:
            data = await svc.fetch_and_parse(url)
            if data["url_count"] > 0:
                return url
        except Exception:
            continue

    # Strategy 4 (last resort): GSC pages via Search Analytics
    # For sites where the server blocks our IP, use all pages Google has seen
    if website and db and website.gsc_cred_id and website.gsc_property:
        try:
            from app.models.user import UserAPICredential
            from app.core.crypto import decrypt_credentials
            from app.services.gsc_service import GSCService
            from datetime import datetime, timedelta
            cred = (await db.execute(
                select(UserAPICredential).where(UserAPICredential.id == website.gsc_cred_id)
            )).scalar_one_or_none()
            if cred:
                creds_json = decrypt_credentials(cred.credentials_enc)
                gsc = GSCService(credentials_json=creds_json, site_url=website.gsc_property)
                end = datetime.now().strftime("%Y-%m-%d")
                start = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")
                body = {
                    "startDate": start, "endDate": end,
                    "dimensions": ["page"], "rowLimit": 25000, "dataState": "all",
                }
                response = gsc.service.searchanalytics().query(
                    siteUrl=website.gsc_property, body=body
                ).execute()
                rows = response.get("rows", [])
                if rows:
                    return f"__gsc_pages__:{website.gsc_property}"
        except Exception:
            pass

    # Return first candidate even if no URLs found (caller will handle error)
    return candidates[0] if candidates else f"{base_url}/sitemap.xml"


async def _fetch_gsc_pages_as_sitemap(website, db, gsc_property: str) -> dict:
    """Fetch all pages from GSC Search Analytics and return in fetch_and_parse format."""
    try:
        from app.models.user import UserAPICredential
        from app.core.crypto import decrypt_credentials
        from app.services.gsc_service import GSCService
        from datetime import timedelta
        cred = (await db.execute(
            select(UserAPICredential).where(UserAPICredential.id == website.gsc_cred_id)
        )).scalar_one_or_none()
        if not cred:
            return {"sitemap_url": f"__gsc_pages__:{gsc_property}", "urls": [], "url_count": 0, "content_hash": None, "error": "GSC credentials not found"}
        creds_json = decrypt_credentials(cred.credentials_enc)
        gsc = GSCService(credentials_json=creds_json, site_url=gsc_property)
        end = datetime.now().strftime("%Y-%m-%d")
        start = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")
        body = {
            "startDate": start, "endDate": end,
            "dimensions": ["page"], "rowLimit": 25000, "dataState": "all",
        }
        response = gsc.service.searchanalytics().query(siteUrl=gsc_property, body=body).execute()
        rows = response.get("rows", [])
        page_urls = [{"url": row["keys"][0], "lastmod": None, "changefreq": None, "priority": None} for row in rows if row.get("keys")]
        import hashlib, json
        content_hash = hashlib.sha256(json.dumps(sorted(u["url"] for u in page_urls)).encode()).hexdigest()
        return {
            "sitemap_url": f"__gsc_pages__:{gsc_property}",
            "urls": page_urls,
            "url_count": len(page_urls),
            "content_hash": content_hash,
            "error": None,
        }
    except Exception as e:
        return {"sitemap_url": f"__gsc_pages__:{gsc_property}", "urls": [], "url_count": 0, "content_hash": None, "error": str(e)}


async def _check_sitemaps_for_site(website_id: int):
    factory = get_sync_session()
    async with factory() as db:
        result = await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))
        website = result.scalar_one_or_none()
        if not website:
            return

        base_url = domain_to_url(website.domain)

        # Discover the best sitemap URL
        sitemap_url = await _discover_sitemap_url(base_url, website=website, db=db)

        from app.services.sitemap_service import SitemapService
        svc = SitemapService()

        if sitemap_url.startswith("__gsc_pages__:"):
            gsc_property = sitemap_url[len("__gsc_pages__:"):]
            data = await _fetch_gsc_pages_as_sitemap(website, db, gsc_property)
        else:
            data = await svc.fetch_and_parse(sitemap_url)

        prev_result = await db.execute(
            select(SitemapSnapshot).where(
                SitemapSnapshot.website_id == website_id,
                SitemapSnapshot.sitemap_url == sitemap_url,
            ).order_by(SitemapSnapshot.recorded_at.desc()).limit(1)
        )
        prev_snap = prev_result.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        snap = SitemapSnapshot(
            website_id=website_id,
            sitemap_url=sitemap_url,
            recorded_at=now,
            url_count=data["url_count"],
            content_hash=data.get("content_hash"),
        )
        db.add(snap)
        await db.flush()

        new_urls = {u["url"] for u in data["urls"]}
        old_urls = set()
        if prev_snap:
            prev_urls_result = await db.execute(
                select(SitemapURL.url).where(SitemapURL.snapshot_id == prev_snap.id)
            )
            old_urls = {r[0] for r in prev_urls_result.all()}

        diff = svc.diff_urls(old_urls, new_urls)

        for url_data in data["urls"]:
            url = url_data["url"]
            if url in diff["added"]:
                status = "added"
            elif url in diff["removed"]:
                status = "removed"
            else:
                status = "present"
            raw_lastmod = url_data.get("lastmod")
            parsed_lastmod = None
            if raw_lastmod:
                try:
                    parsed_lastmod = date_type.fromisoformat(str(raw_lastmod)[:10])
                except Exception:
                    parsed_lastmod = None
            db.add(SitemapURL(
                snapshot_id=snap.id,
                website_id=website_id,
                url=url,
                lastmod=parsed_lastmod,
                changefreq=url_data.get("changefreq"),
                priority=url_data.get("priority"),
                status=status,
            ))

        await db.commit()

        try:
            from app.services.alert_service import AlertService
            alert_svc = AlertService(db)
            await alert_svc.evaluate_all_for_website(website_id)
            await db.commit()
        except Exception:
            pass


@celery_app.task(name="app.tasks.sitemap_tasks.check_sitemaps_for_site", bind=True, max_retries=3)
def check_sitemaps_for_site(self, website_id: int):
    try:
        run_async(_check_sitemaps_for_site(website_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(name="app.tasks.sitemap_tasks.check_sitemaps_all_sites")
def check_sitemaps_all_sites():
    async def _get_ids():
        factory = get_sync_session()
        async with factory() as db:
            result = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in result.all()]

    for site_id in run_async(_get_ids()):
        check_sitemaps_for_site.delay(site_id)
