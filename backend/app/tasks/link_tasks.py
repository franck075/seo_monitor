from datetime import datetime, timezone
from sqlalchemy import select, delete as sql_delete
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.models.links import LinkReport, BacklinkEntry, ReferringDomainEntry, AnchorTextEntry, BacklinkMonitor
from app.core.crypto import decrypt_credentials


async def _pull_links_for_site(website_id: int):
    factory = get_sync_session()
    async with factory() as db:
        result = await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))
        website = result.scalar_one_or_none()
        if not website or not website.ahrefs_api_key_enc:
            return

        try:
            api_key = decrypt_credentials(website.ahrefs_api_key_enc).get("api_key", "")
        except Exception:
            return
        if not api_key:
            return

        domain = website.domain.replace("https://", "").replace("http://", "").rstrip("/")

        from app.services.ahrefs_service import AhrefsService
        ahrefs = AhrefsService(api_key=api_key, target=domain)
        now = datetime.now(timezone.utc)

        # ── Metrics overview ──────────────────────────────────────────────────
        try:
            metrics = ahrefs.get_metrics()
        except Exception:
            return

        db.add(LinkReport(website_id=website_id, recorded_at=now, **metrics))

        # ── Backlinks ─────────────────────────────────────────────────────────
        try:
            backlinks = ahrefs.get_backlinks(limit=1000)

            # Fetch existing keys
            ex_result = await db.execute(
                select(BacklinkEntry.url_from, BacklinkEntry.url_to)
                .where(BacklinkEntry.website_id == website_id)
            )
            existing_keys = {(r[0], r[1]) for r in ex_result.all()}
            current_keys = {(b["url_from"], b["url_to"]) for b in backlinks}

            # Mark lost backlinks (no longer in top 1000)
            for url_from, url_to in existing_keys - current_keys:
                entry_r = await db.execute(
                    select(BacklinkEntry).where(
                        BacklinkEntry.website_id == website_id,
                        BacklinkEntry.url_from == url_from,
                        BacklinkEntry.url_to == url_to,
                    )
                )
                entry = entry_r.scalar_one_or_none()
                if entry:
                    entry.is_lost = True
                    entry.updated_at = now

            # Upsert current backlinks
            for bl in backlinks:
                entry_r = await db.execute(
                    select(BacklinkEntry).where(
                        BacklinkEntry.website_id == website_id,
                        BacklinkEntry.url_from == bl["url_from"],
                        BacklinkEntry.url_to == bl["url_to"],
                    )
                )
                entry = entry_r.scalar_one_or_none()
                if entry:
                    entry.title = bl.get("title")
                    entry.anchor_text = bl["anchor_text"]
                    entry.snippet_left = bl.get("snippet_left")
                    entry.snippet_right = bl.get("snippet_right")
                    entry.is_dofollow = bl["is_dofollow"]
                    entry.is_nofollow = bl.get("is_nofollow", False)
                    entry.is_ugc = bl.get("is_ugc", False)
                    entry.is_sponsored = bl.get("is_sponsored", False)
                    entry.is_content = bl.get("is_content", False)
                    entry.is_spam = bl.get("is_spam", False)
                    entry.link_type = bl.get("link_type")
                    entry.http_code = bl.get("http_code")
                    entry.domain_rating = bl["domain_rating"]
                    entry.url_rating = bl.get("url_rating")
                    entry.traffic = bl.get("traffic")
                    entry.traffic_domain = bl.get("traffic_domain")
                    entry.refdomains_source = bl.get("refdomains_source")
                    entry.lost_reason = bl.get("lost_reason")
                    entry.discovered_status = bl.get("discovered_status")
                    entry.last_seen_at = now
                    entry.is_new = False
                    entry.is_lost = False
                    entry.updated_at = now
                else:
                    db.add(BacklinkEntry(
                        website_id=website_id,
                        url_from=bl["url_from"],
                        domain_from=bl["domain_from"],
                        url_to=bl["url_to"],
                        title=bl.get("title"),
                        anchor_text=bl["anchor_text"],
                        snippet_left=bl.get("snippet_left"),
                        snippet_right=bl.get("snippet_right"),
                        is_dofollow=bl["is_dofollow"],
                        is_nofollow=bl.get("is_nofollow", False),
                        is_ugc=bl.get("is_ugc", False),
                        is_sponsored=bl.get("is_sponsored", False),
                        is_content=bl.get("is_content", False),
                        is_spam=bl.get("is_spam", False),
                        link_type=bl.get("link_type"),
                        http_code=bl.get("http_code"),
                        domain_rating=bl["domain_rating"],
                        url_rating=bl.get("url_rating"),
                        traffic=bl.get("traffic"),
                        traffic_domain=bl.get("traffic_domain"),
                        refdomains_source=bl.get("refdomains_source"),
                        lost_reason=bl.get("lost_reason"),
                        discovered_status=bl.get("discovered_status"),
                        first_seen_at=now,
                        last_seen_at=now,
                        is_new=True,
                        is_lost=False,
                        updated_at=now,
                    ))
        except Exception:
            pass

        # ── Referring Domains ─────────────────────────────────────────────────
        try:
            ref_domains = ahrefs.get_referring_domains(limit=1000)

            ex_rd_r = await db.execute(
                select(ReferringDomainEntry.domain)
                .where(ReferringDomainEntry.website_id == website_id)
            )
            existing_domains = {r[0] for r in ex_rd_r.all()}
            current_domains = {rd["domain"] for rd in ref_domains}

            # Mark lost domains
            for domain in existing_domains - current_domains:
                entry_r = await db.execute(
                    select(ReferringDomainEntry).where(
                        ReferringDomainEntry.website_id == website_id,
                        ReferringDomainEntry.domain == domain,
                    )
                )
                entry = entry_r.scalar_one_or_none()
                if entry:
                    entry.is_lost = True
                    entry.updated_at = now

            # Upsert current
            for rd in ref_domains:
                entry_r = await db.execute(
                    select(ReferringDomainEntry).where(
                        ReferringDomainEntry.website_id == website_id,
                        ReferringDomainEntry.domain == rd["domain"],
                    )
                )
                entry = entry_r.scalar_one_or_none()
                if entry:
                    entry.backlinks_count = rd["backlinks_count"]
                    entry.is_dofollow = rd["is_dofollow"]
                    entry.domain_rating = rd["domain_rating"]
                    entry.last_seen_at = now
                    entry.is_new = False
                    entry.is_lost = False
                    entry.updated_at = now
                else:
                    db.add(ReferringDomainEntry(
                        website_id=website_id,
                        domain=rd["domain"],
                        backlinks_count=rd["backlinks_count"],
                        is_dofollow=rd["is_dofollow"],
                        domain_rating=rd["domain_rating"],
                        first_seen_at=now,
                        last_seen_at=now,
                        is_new=True,
                        is_lost=False,
                        updated_at=now,
                    ))
        except Exception:
            pass

        # ── Anchor Texts ──────────────────────────────────────────────────────
        try:
            anchors = ahrefs.get_anchors(limit=100)
            await db.execute(
                sql_delete(AnchorTextEntry).where(AnchorTextEntry.website_id == website_id)
            )
            for a in anchors:
                db.add(AnchorTextEntry(
                    website_id=website_id,
                    anchor=a["anchor"],
                    backlinks_count=a["backlinks_count"],
                    referring_domains_count=a["referring_domains_count"],
                    dofollow_count=a["dofollow_count"],
                    updated_at=now,
                ))
        except Exception:
            pass

        # ── Suspicious Detection + Monitor Alerts ─────────────────────────────
        try:
            await _check_suspicious_backlinks(db, website_id, now)
        except Exception:
            pass

        await db.commit()


async def _check_suspicious_backlinks(db, website_id: int, now):
    """
    For each active BacklinkMonitor, scan new/updated backlinks against
    their target and flag suspicious ones based on:
      1. Ahrefs spam flag
      2. DR below monitor threshold
      3. UGC link from low-authority site (DR < 20)
      4. HTTP error on source page (4xx/5xx)
      5. Link velocity: multiple new backlinks from same domain in same run
    Sends alert only once per backlink (alerted_at is null).
    """
    mon_result = await db.execute(
        select(BacklinkMonitor).where(
            BacklinkMonitor.website_id == website_id,
            BacklinkMonitor.is_active == True,
        )
    )
    monitors = mon_result.scalars().all()
    if not monitors:
        return

    # Count new links per domain this run (for velocity detection)
    vel_result = await db.execute(
        select(BacklinkEntry).where(
            BacklinkEntry.website_id == website_id,
            BacklinkEntry.is_new == True,
            BacklinkEntry.updated_at >= now,
        )
    )
    new_entries = vel_result.scalars().all()
    domain_velocity: dict = {}
    for e in new_entries:
        domain_velocity[e.domain_from] = domain_velocity.get(e.domain_from, 0) + 1

    for monitor in monitors:
        # Fetch backlinks matching monitor target (url or domain)
        target = monitor.target.rstrip("/")
        q = select(BacklinkEntry).where(
            BacklinkEntry.website_id == website_id,
            BacklinkEntry.is_dismissed == False,
        )
        # If target looks like a full URL — match url_to; otherwise match domain_from source OR url_to prefix
        if target.startswith("http"):
            q = q.where(BacklinkEntry.url_to.ilike(f"{target}%"))
        else:
            # domain monitor — all backlinks pointing to this site qualify
            pass  # already filtered by website_id

        bl_result = await db.execute(q)
        backlinks = bl_result.scalars().all()

        suspect_to_alert = []

        for bl in backlinks:
            reasons = []
            dr = float(bl.domain_rating) if bl.domain_rating else 0

            if bl.is_spam:
                reasons.append("Marqué spam par Ahrefs")
            if monitor.notify_suspicious and dr > 0 and dr < monitor.dr_threshold:
                reasons.append(f"DR très faible ({int(dr)})")
            if bl.is_ugc and dr < 20:
                reasons.append(f"Lien UGC depuis site faible autorité (DR {int(dr)})")
            if bl.http_code and bl.http_code >= 400:
                reasons.append(f"Page source erreur HTTP {bl.http_code}")
            if domain_velocity.get(bl.domain_from, 0) >= 5 and bl.is_new:
                reasons.append(f"Pic de liens : {domain_velocity[bl.domain_from]} nouveaux liens depuis {bl.domain_from}")

            if reasons:
                reason_str = " | ".join(reasons)
                bl.is_suspicious = True
                bl.suspicious_reason = reason_str[:200]

                # Only alert once
                if bl.alerted_at is None and monitor.notify_suspicious:
                    suspect_to_alert.append(bl)

            # New backlink alert (regardless of suspicion)
            if bl.is_new and monitor.notify_new and bl.alerted_at is None:
                if bl not in suspect_to_alert:
                    try:
                        from app.services.alert_service import AlertService
                        alert_svc = AlertService(db)
                        await alert_svc.dispatch_backlink_monitor_alert(
                            monitor=monitor,
                            backlink=bl,
                            alert_type="new",
                        )
                    except Exception:
                        pass
                    bl.alerted_at = now

        if suspect_to_alert and monitor.notify_suspicious:
            try:
                from app.services.alert_service import AlertService
                alert_svc = AlertService(db)
                for bl in suspect_to_alert:
                    await alert_svc.dispatch_backlink_monitor_alert(
                        monitor=monitor,
                        backlink=bl,
                        alert_type="suspicious",
                    )
                    bl.alerted_at = now
            except Exception:
                pass

        monitor.last_checked_at = now


@celery_app.task(name="app.tasks.link_tasks.pull_links_for_site", bind=True, max_retries=2)
def pull_links_for_site(self, website_id: int):
    try:
        run_async(_pull_links_for_site(website_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(name="app.tasks.link_tasks.pull_links_all_sites")
def pull_links_all_sites():
    async def _get_ids():
        factory = get_sync_session()
        async with factory() as db:
            result = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in result.all()]

    for site_id in run_async(_get_ids()):
        pull_links_for_site.delay(site_id)
