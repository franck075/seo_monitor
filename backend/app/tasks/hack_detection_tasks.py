"""
Détection de hack SEO :
  1. SPAM_KEYWORD  — mots-clés pharmaceutiques / adultes dans les données GSC
  2. HIDDEN_LINK   — liens cachés injectés dans le HTML des pages
  3. INJECTED_PAGE — URLs indexées par Google qui n'existent pas dans le sitemap
"""
import re
import httpx
from datetime import datetime, timezone
from sqlalchemy import select, delete
from app.tasks.celery_app import celery_app
from app.tasks.base import get_sync_session, run_async
from app.models.website import Website
from app.models.hack_detection import HackDetection

# ── Dictionnaire de termes suspects ──────────────────────────────────────────

SPAM_TERMS = [
    # Pharma masculin
    "viagra", "cialis", "levitra", "tadalafil", "sildenafil", "vardenafil",
    "erectile", "erection", "impuissance", "dysfonction", "male enhancement",
    "penis enlargement", "agrandissement", "virilité", "virilite",
    # Pharma générique
    "buy pills", "cheap pills", "online pharmacy", "pharmacie en ligne",
    "prescription free", "sans ordonnance", "order online",
    # Casino / spam
    "casino online", "slots", "poker online", "bet365", "1xbet",
    # Crypto spam
    "crypto pump", "bitcoin doubler",
]

# Patterns HTML pour liens cachés
HIDDEN_PATTERNS = [
    r'style\s*=\s*["\'][^"\']*display\s*:\s*none[^"\']*["\']',
    r'style\s*=\s*["\'][^"\']*visibility\s*:\s*hidden[^"\']*["\']',
    r'style\s*=\s*["\'][^"\']*position\s*:\s*absolute[^"\']*top\s*:\s*-\d{3,}[^"\']*["\']',
    r'style\s*=\s*["\'][^"\']*left\s*:\s*-\d{3,}px[^"\']*["\']',
    r'style\s*=\s*["\'][^"\']*font-size\s*:\s*0[^"\']*["\']',
    r'style\s*=\s*["\'][^"\']*opacity\s*:\s*0[^"\']*["\']',
    r'class\s*=\s*["\'][^"\']*hidden-link[^"\']*["\']',
]


def _contains_spam_term(text: str) -> str | None:
    lower = text.lower()
    for term in SPAM_TERMS:
        if term in lower:
            return term
    return None


def _find_hidden_links(html: str) -> list[dict]:
    """Retourne les liens suspects trouvés dans le HTML."""
    found = []
    # Cherche toutes les balises <a>
    links = re.findall(r'<a\s[^>]*href\s*=\s*["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, re.IGNORECASE | re.DOTALL)
    for href, anchor_text in links:
        clean_anchor = re.sub(r'<[^>]+>', '', anchor_text).strip()
        term = _contains_spam_term(href) or _contains_spam_term(clean_anchor)
        if term:
            found.append({"href": href[:200], "anchor": clean_anchor[:100], "term": term, "reason": "spam_term"})
            continue
        # Vérifie si le lien est caché
        link_tag = re.search(rf'<a\s[^>]*href\s*=\s*["\']' + re.escape(href[:50]), html, re.IGNORECASE)
        if link_tag:
            surrounding = html[max(0, link_tag.start()-100):link_tag.end()+200]
            for pattern in HIDDEN_PATTERNS:
                if re.search(pattern, surrounding, re.IGNORECASE):
                    found.append({"href": href[:200], "anchor": clean_anchor[:100], "term": None, "reason": "hidden_style"})
                    break
    return found[:10]  # max 10 résultats par page


async def _scan_for_hacks(website_id: int):
    factory = get_sync_session()
    async with factory() as db:

        # Charger le site
        site = (await db.execute(select(Website).where(Website.id == website_id, Website.is_active == True))).scalar_one_or_none()
        if not site:
            return

        # ── 1. SPAM_KEYWORD via keyword_positions ────────────────────────────
        from sqlalchemy import text
        kw_rows = await db.execute(text("""
            SELECT DISTINCT k.query
            FROM keywords k
            JOIN keyword_positions kp ON kp.keyword_id = k.id
            WHERE k.website_id = :wid
              AND kp.recorded_date >= CURRENT_DATE - (90 * INTERVAL '1 day')
        """), {"wid": website_id})
        queries = [r[0] for r in kw_rows.all()]

        # Supprimer les anciennes détections spam_keyword pour ce site
        await db.execute(
            delete(HackDetection).where(
                HackDetection.website_id == website_id,
                HackDetection.detection_type == "spam_keyword",
                HackDetection.is_resolved == False,
            )
        )

        spam_found = []
        for query in queries:
            term = _contains_spam_term(query)
            if term:
                spam_found.append(query)
                db.add(HackDetection(
                    website_id=website_id,
                    url=f"https://{site.domain}/",
                    detection_type="spam_keyword",
                    severity="high",
                    detail=f"Mot-clé suspect détecté dans Search Console : « {query} »",
                    sample=query,
                ))

        # ── 2. HIDDEN_LINK — scan HTML des pages surveillées ──────────────────
        from app.models.monitoring import SitemapURL, SitemapSnapshot
        snap = (await db.execute(
            select(SitemapSnapshot.id)
            .where(SitemapSnapshot.website_id == website_id)
            .order_by(SitemapSnapshot.recorded_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        urls_to_scan = []
        if snap:
            url_rows = await db.execute(
                select(SitemapURL.url)
                .where(SitemapURL.snapshot_id == snap, SitemapURL.status == "present")
                .limit(30)
            )
            urls_to_scan = [r[0] for r in url_rows.all()]

        # Supprimer les anciennes détections hidden_link
        await db.execute(
            delete(HackDetection).where(
                HackDetection.website_id == website_id,
                HackDetection.detection_type == "hidden_link",
                HackDetection.is_resolved == False,
            )
        )

        async with httpx.AsyncClient(timeout=15, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0 SEO-Monitor-Bot/1.0"}) as client:
            for url in urls_to_scan:
                try:
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        continue
                    html = resp.text
                    hidden = _find_hidden_links(html)
                    for h in hidden:
                        db.add(HackDetection(
                            website_id=website_id,
                            url=url,
                            detection_type="hidden_link",
                            severity="high" if h["reason"] == "spam_term" else "medium",
                            detail=f"Lien suspect {'(terme spam)' if h['reason'] == 'spam_term' else '(lien caché)'} : {h['anchor'] or h['href']}",
                            sample=f"href={h['href']} anchor={h['anchor']}",
                        ))
                except Exception:
                    continue

        # ── 3. INJECTED_PAGE — mots-clés GSC sur des URLs hors sitemap ────────
        if snap:
            sitemap_url_rows = await db.execute(
                select(SitemapURL.url).where(SitemapURL.snapshot_id == snap, SitemapURL.status == "present")
            )
            sitemap_urls = {r[0] for r in sitemap_url_rows.all()}

            kw_pages = await db.execute(text("""
                SELECT DISTINCT k.page, k.query
                FROM keywords k
                JOIN keyword_positions kp ON kp.keyword_id = k.id
                WHERE k.website_id = :wid
                  AND k.page IS NOT NULL
                  AND kp.recorded_date >= CURRENT_DATE - (30 * INTERVAL '1 day')
                  AND kp.impressions > 5
            """), {"wid": website_id})

            domain = site.domain
            await db.execute(
                delete(HackDetection).where(
                    HackDetection.website_id == website_id,
                    HackDetection.detection_type == "injected_page",
                    HackDetection.is_resolved == False,
                )
            )

            seen_injected = set()
            for page, query in kw_pages.all():
                if not page or page in seen_injected:
                    continue
                # Normalise l'URL pour comparer au sitemap
                normalized = page.rstrip("/")
                in_sitemap = any(su.rstrip("/") == normalized or normalized.startswith(su.rstrip("/")) for su in sitemap_urls)
                if not in_sitemap and domain in page:
                    spam_in_query = _contains_spam_term(query or "")
                    spam_in_page = _contains_spam_term(page)
                    if spam_in_query or spam_in_page:
                        seen_injected.add(page)
                        db.add(HackDetection(
                            website_id=website_id,
                            url=page,
                            detection_type="injected_page",
                            severity="high",
                            detail=f"Page hors sitemap indexée avec terme suspect : « {spam_in_query or spam_in_page} »",
                            sample=f"query={query} page={page}",
                        ))

        await db.commit()


@celery_app.task(name="app.tasks.hack_detection_tasks.scan_for_hacks", bind=True, max_retries=1)
def scan_for_hacks(self, website_id: int):
    try:
        run_async(_scan_for_hacks(website_id))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(name="app.tasks.hack_detection_tasks.scan_all_sites")
def scan_all_sites():
    async def _get_ids():
        factory = get_sync_session()
        async with factory() as db:
            rows = await db.execute(select(Website.id).where(Website.is_active == True))
            return [r[0] for r in rows.all()]
    ids = run_async(_get_ids())
    for wid in ids:
        scan_for_hacks.delay(wid)
