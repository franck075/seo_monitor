from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, text
from typing import Optional, List
from app.db.session import get_db
from app.models.website import Website
from app.models.monitoring import CoreWebVital, MonitoredPage, SitemapURL, SitemapSnapshot
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from pydantic import BaseModel
from datetime import datetime, timezone

router = APIRouter(prefix="/websites/{website_id}/vitals", tags=["vitals"])


async def _verify_site(website_id: int, db: AsyncSession, owner_id: int) -> Website:
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == owner_id))
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    return site


class PageCreate(BaseModel):
    url: str
    label: Optional[str] = None


# ── Monitored pages ───────────────────────────────────────────────────────────

@router.get("/pages")
async def list_pages(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(MonitoredPage)
        .where(MonitoredPage.website_id == website_id, MonitoredPage.user_id == effective_owner_id)
        .order_by(MonitoredPage.created_at)
    )
    pages = result.scalars().all()

    out = []
    for page in pages:
        # Get latest vitals for each strategy
        vitals = {}
        for strategy in ["mobile", "desktop"]:
            vr = await db.execute(
                select(CoreWebVital)
                .where(CoreWebVital.website_id == website_id, CoreWebVital.page_url == page.url, CoreWebVital.strategy == strategy)
                .order_by(desc(CoreWebVital.recorded_at))
                .limit(1)
            )
            v = vr.scalar_one_or_none()
            if v:
                vitals[strategy] = {
                    "performance_score": v.performance_score,
                    "lcp": float(v.lcp) if v.lcp else None,
                    "cls": float(v.cls) if v.cls else None,
                    "inp": float(v.inp) if v.inp else None,
                    "ttfb": float(v.ttfb) if v.ttfb else None,
                    "fcp": float(v.fcp) if v.fcp else None,
                    "lcp_rating": v.lcp_rating,
                    "cls_rating": v.cls_rating,
                    "inp_rating": v.inp_rating,
                    "ttfb_rating": v.ttfb_rating,
                    "recorded_at": str(v.recorded_at),
                }
        out.append({
            "id": page.id,
            "url": page.url,
            "label": page.label or page.url.replace("https://", "").replace("http://", ""),
            "is_active": page.is_active,
            "created_at": str(page.created_at),
            "vitals": vitals,
        })
    return out


@router.post("/pages", status_code=201)
async def add_page(
    website_id: int,
    payload: PageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)

    url = payload.url.strip().rstrip("/")
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    # Check duplicate
    existing = await db.execute(
        select(MonitoredPage).where(MonitoredPage.website_id == website_id, MonitoredPage.url == url)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Page déjà surveillée")

    page = MonitoredPage(
        user_id=effective_owner_id,
        website_id=website_id,
        url=url,
        label=payload.label,
    )
    db.add(page)
    await db.flush()
    await db.refresh(page)
    await db.commit()

    # Trigger Celery scan
    from app.tasks.vitals_tasks import scan_page_url
    scan_page_url.delay(website_id, url)

    return {"id": page.id, "url": page.url, "label": page.label}


@router.delete("/pages/{page_id}", status_code=204)
async def delete_page(
    website_id: int,
    page_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(MonitoredPage).where(MonitoredPage.id == page_id, MonitoredPage.website_id == website_id, MonitoredPage.user_id == effective_owner_id)
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    await db.delete(page)
    await db.commit()


@router.post("/pages/{page_id}/scan")
async def scan_page(
    website_id: int,
    page_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Trigger an immediate PageSpeed scan for this page via Celery."""
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(MonitoredPage).where(MonitoredPage.id == page_id, MonitoredPage.website_id == website_id)
    )
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    from app.tasks.vitals_tasks import scan_page_url
    scan_page_url.delay(website_id, page.url)
    return {"message": "Scan démarré", "url": page.url}


# ── Vitals list & history ─────────────────────────────────────────────────────

@router.get("")
async def get_vitals(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    strategy: str = Query("mobile"),
    page_url: Optional[str] = Query(None),
):
    await _verify_site(website_id, db, effective_owner_id)
    q = select(CoreWebVital).where(CoreWebVital.website_id == website_id, CoreWebVital.strategy == strategy)
    if page_url:
        q = q.where(CoreWebVital.page_url == page_url)
    q = q.order_by(desc(CoreWebVital.recorded_at)).limit(100)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "page_url": r.page_url,
            "strategy": r.strategy,
            "recorded_at": str(r.recorded_at),
            "performance_score": r.performance_score,
            "lcp": float(r.lcp) if r.lcp else None,
            "cls": float(r.cls) if r.cls else None,
            "inp": float(r.inp) if r.inp else None,
            "ttfb": float(r.ttfb) if r.ttfb else None,
            "fcp": float(r.fcp) if r.fcp else None,
            "lcp_rating": r.lcp_rating,
            "cls_rating": r.cls_rating,
            "inp_rating": r.inp_rating,
            "ttfb_rating": r.ttfb_rating,
        }
        for r in rows
    ]


@router.get("/history")
async def get_vitals_history(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    page_url: str = Query(...),
    strategy: str = Query("mobile"),
    limit: int = Query(30),
):
    await _verify_site(website_id, db, effective_owner_id)
    result = await db.execute(
        select(CoreWebVital)
        .where(CoreWebVital.website_id == website_id, CoreWebVital.page_url == page_url, CoreWebVital.strategy == strategy)
        .order_by(CoreWebVital.recorded_at)
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "recorded_at": str(r.recorded_at),
            "performance_score": r.performance_score,
            "lcp": float(r.lcp) if r.lcp else None,
            "cls": float(r.cls) if r.cls else None,
            "inp": float(r.inp) if r.inp else None,
            "ttfb": float(r.ttfb) if r.ttfb else None,
            "lcp_rating": r.lcp_rating,
            "cls_rating": r.cls_rating,
            "inp_rating": r.inp_rating,
        }
        for r in rows
    ]


@router.get("/sitemap-pages")
async def get_sitemap_pages_vitals(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    strategy: str = Query("mobile"),
):
    """Retourne toutes les pages du sitemap avec leurs derniers scores CWV."""
    await _verify_site(website_id, db, effective_owner_id)

    snap = (await db.execute(
        select(SitemapSnapshot.id)
        .where(SitemapSnapshot.website_id == website_id)
        .order_by(desc(SitemapSnapshot.recorded_at))
        .limit(1)
    )).scalar_one_or_none()

    if not snap:
        return {"has_sitemap": False, "pages": []}

    urls_result = await db.execute(
        select(SitemapURL.url)
        .where(SitemapURL.snapshot_id == snap, SitemapURL.status == "present")
        .order_by(SitemapURL.url)
    )
    sitemap_urls = [r[0] for r in urls_result.all()]

    if sitemap_urls:
        vitals_result = await db.execute(text("""
            SELECT DISTINCT ON (page_url) page_url,
                   performance_score, lcp, cls, inp, ttfb, fcp,
                   lcp_rating, cls_rating, inp_rating, ttfb_rating, recorded_at
            FROM core_web_vitals
            WHERE website_id = :wid AND strategy = :strategy
              AND page_url = ANY(:urls)
            ORDER BY page_url, recorded_at DESC
        """), {"wid": website_id, "strategy": strategy, "urls": sitemap_urls})
        vitals_map = {r.page_url: r for r in vitals_result.all()}
    else:
        vitals_map = {}

    pages = []
    for url in sitemap_urls:
        v = vitals_map.get(url)
        pages.append({
            "url": url,
            "scanned": v is not None,
            "performance_score": v.performance_score if v else None,
            "lcp": float(v.lcp) if v and v.lcp else None,
            "cls": float(v.cls) if v and v.cls else None,
            "inp": float(v.inp) if v and v.inp else None,
            "ttfb": float(v.ttfb) if v and v.ttfb else None,
            "lcp_rating": v.lcp_rating if v else None,
            "cls_rating": v.cls_rating if v else None,
            "inp_rating": v.inp_rating if v else None,
            "ttfb_rating": v.ttfb_rating if v else None,
            "recorded_at": str(v.recorded_at) if v else None,
        })

    scanned = sum(1 for p in pages if p["scanned"])
    return {
        "has_sitemap": True,
        "total": len(pages),
        "scanned": scanned,
        "strategy": strategy,
        "pages": pages,
    }


@router.post("/scan-all-sitemap")
async def scan_all_sitemap_pages(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    """Importe toutes les pages du sitemap comme pages surveillées et lance les scans via Celery."""
    await _verify_site(website_id, db, effective_owner_id)

    snap = (await db.execute(
        select(SitemapSnapshot.id)
        .where(SitemapSnapshot.website_id == website_id)
        .order_by(desc(SitemapSnapshot.recorded_at))
        .limit(1)
    )).scalar_one_or_none()

    if not snap:
        raise HTTPException(status_code=404, detail="Aucun sitemap disponible")

    urls_result = await db.execute(
        select(SitemapURL.url)
        .where(SitemapURL.snapshot_id == snap, SitemapURL.status == "present")
    )
    sitemap_urls = [r[0] for r in urls_result.all()]

    existing_result = await db.execute(
        select(MonitoredPage.url).where(MonitoredPage.website_id == website_id)
    )
    existing_urls = {r[0] for r in existing_result.all()}

    from app.tasks.vitals_tasks import scan_page_url
    added = 0
    triggered = 0
    for url in sitemap_urls:
        if url not in existing_urls:
            db.add(MonitoredPage(
                user_id=effective_owner_id,
                website_id=website_id,
                url=url,
                label=None,
            ))
            added += 1
        scan_page_url.delay(website_id, url)
        triggered += 1

    await db.commit()
    return {"added": added, "triggered": triggered, "total_sitemap_urls": len(sitemap_urls)}
