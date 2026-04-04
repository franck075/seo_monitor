from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.website import Website
from app.schemas.website import WebsiteCreate, WebsiteUpdate, WebsiteOut
from app.deps import get_current_user
from app.models.user import User
from app.core.url_utils import normalize_domain
from sqlalchemy import func
from app.models.user import UserAPICredential

PLAN_LIMITS = {"starter": 1, "pro": 5, "agency": -1}

router = APIRouter(prefix="/websites", tags=["websites"])


def _normalize_payload(data: dict) -> dict:
    """Ensure domain is stored as bare domain and gsc_property has no double prefix."""
    if "domain" in data and data["domain"]:
        data["domain"] = normalize_domain(data["domain"])
    if "gsc_property" in data and data["gsc_property"]:
        prop = data["gsc_property"].strip()
        # Fix sc-domain:https://... → sc-domain:bare-domain
        if prop.startswith("sc-domain:http"):
            bare = normalize_domain(prop.replace("sc-domain:", "", 1))
            prop = f"sc-domain:{bare}"
        data["gsc_property"] = prop
    return data


async def get_owner_id(user: User, db: AsyncSession) -> int:
    """Return effective owner_id: for team members returns owner's ID, otherwise user's own ID."""
    from app.models.team import TeamMember
    membership = (await db.execute(
        select(TeamMember).where(TeamMember.member_id == user.id)
    )).scalar_one_or_none()
    return membership.owner_id if membership else user.id


async def get_team_role(user_id: int, db: AsyncSession):
    """Return the user's role in a team (or None if not a team member)."""
    from app.models.team import TeamMember
    membership = (await db.execute(
        select(TeamMember).where(TeamMember.member_id == user_id)
    )).scalar_one_or_none()
    return membership.role if membership else None


@router.get("", response_model=list[WebsiteOut])
async def list_websites(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    effective_owner_id = await get_owner_id(current_user, db)
    result = await db.execute(select(Website).where(Website.user_id == effective_owner_id).order_by(Website.created_at.desc()))
    return result.scalars().all()


@router.get("/perf-summary")
async def perf_summary(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Score PageSpeed moyen (mobile) sur toutes les pages scannées de tous les sites de l'utilisateur."""
    from sqlalchemy import text
    effective_owner_id = await get_owner_id(current_user, db)
    row = await db.execute(text("""
        SELECT
            ROUND(AVG(performance_score)) AS avg_score,
            COUNT(DISTINCT page_url)       AS total_pages,
            ROUND(AVG(lcp::numeric) / 1000.0, 1) AS avg_lcp_s
        FROM (
            SELECT DISTINCT ON (website_id, page_url)
                website_id, page_url, performance_score, lcp
            FROM core_web_vitals
            WHERE strategy = 'mobile'
              AND website_id IN (
                  SELECT id FROM websites WHERE user_id = :uid
              )
            ORDER BY website_id, page_url, recorded_at DESC
        ) latest
    """), {"uid": effective_owner_id})
    r = row.fetchone()
    return {
        "avg_score": int(r.avg_score) if r.avg_score is not None else None,
        "total_pages": r.total_pages or 0,
        "avg_lcp_s": float(r.avg_lcp_s) if r.avg_lcp_s is not None else None,
    }

@router.post("", response_model=WebsiteOut)
async def create_website(payload: WebsiteCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Viewers cannot create websites
    team_role = await get_team_role(current_user.id, db)
    if team_role == "viewer":
        raise HTTPException(status_code=403, detail="Accès en lecture seule")

    effective_owner_id = await get_owner_id(current_user, db)

    # Determine plan from the effective owner
    from app.models.user import User as UserModel
    if effective_owner_id != current_user.id:
        owner = (await db.execute(select(UserModel).where(UserModel.id == effective_owner_id))).scalar_one_or_none()
        plan = getattr(owner, "plan", "starter") if owner else "starter"
    else:
        plan = getattr(current_user, "plan", "starter")

    limit = PLAN_LIMITS.get(plan, 1)
    if limit != -1:
        count = (await db.execute(
            select(func.count(Website.id)).where(Website.user_id == effective_owner_id)
        )).scalar() or 0
        if count >= limit:
            raise HTTPException(
                status_code=403,
                detail=f"Votre plan '{plan}' est limité à {limit} site(s). Passez à un plan supérieur."
            )
    # — Vérification credentials GSC obligatoires —
    if not payload.gsc_cred_id:
        raise HTTPException(
            status_code=422,
            detail="Un credential Google (Service Account JSON) est requis pour ajouter un site. Configurez-le dans Paramètres avant de continuer."
        )
    if not payload.gsc_property or not payload.gsc_property.strip():
        raise HTTPException(
            status_code=422,
            detail="La propriété Google Search Console est obligatoire (ex: https://exemple.com/ ou sc-domain:exemple.com)."
        )
    # Vérifier que le credential appartient bien à l'utilisateur effectif
    cred_result = await db.execute(
        select(UserAPICredential).where(
            UserAPICredential.id == payload.gsc_cred_id,
            UserAPICredential.user_id == effective_owner_id,
        )
    )
    if not cred_result.scalar_one_or_none():
        raise HTTPException(status_code=422, detail="Credential GSC introuvable ou non autorisé.")

    website = Website(**_normalize_payload(payload.model_dump()), user_id=effective_owner_id)
    db.add(website)
    await db.flush()
    await db.refresh(website)
    await db.commit()

    # Trigger immediate data collection — each task handles missing credentials gracefully
    _trigger_initial_scan(website.id)

    return website


def _trigger_initial_scan(website_id: int):
    """Fire all per-site tasks immediately after website creation."""
    try:
        from app.tasks.keyword_tasks import pull_keywords_for_site, backfill_keywords_for_site
        pull_keywords_for_site.delay(website_id)
        backfill_keywords_for_site.delay(website_id)  # 6 months of historical keyword data
    except Exception:
        pass
    try:
        from app.tasks.traffic_tasks import pull_traffic_for_site, backfill_traffic_for_site
        pull_traffic_for_site.delay(website_id)
        backfill_traffic_for_site.delay(website_id)   # 90 days of historical traffic
    except Exception:
        pass
    try:
        from app.tasks.vitals_tasks import pull_vitals_for_site
        pull_vitals_for_site.delay(website_id)
    except Exception:
        pass
    try:
        from app.tasks.seo_check_tasks import check_seo_for_site
        check_seo_for_site.delay(website_id)
    except Exception:
        pass
    try:
        from app.tasks.http_check_tasks import check_http_for_site
        check_http_for_site.delay(website_id)
    except Exception:
        pass
    try:
        from app.tasks.sitemap_tasks import check_sitemaps_for_site
        check_sitemaps_for_site.delay(website_id)
    except Exception:
        pass
    try:
        from app.tasks.indexation_tasks import inspect_all_for_site
        inspect_all_for_site.delay(website_id)
    except Exception:
        pass
    try:
        from app.tasks.link_tasks import pull_links_for_site
        pull_links_for_site.delay(website_id)
    except Exception:
        pass

@router.get("/{website_id}", response_model=WebsiteOut)
async def get_website(website_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    effective_owner_id = await get_owner_id(current_user, db)
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == effective_owner_id))
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    return website

@router.put("/{website_id}", response_model=WebsiteOut)
async def update_website(website_id: int, payload: WebsiteUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Viewers cannot update websites
    team_role = await get_team_role(current_user.id, db)
    if team_role == "viewer":
        raise HTTPException(status_code=403, detail="Accès en lecture seule")

    effective_owner_id = await get_owner_id(current_user, db)
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == effective_owner_id))
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    for key, value in _normalize_payload(payload.model_dump(exclude_none=True)).items():
        setattr(website, key, value)
    await db.flush()
    await db.refresh(website)
    return website

@router.post("/{website_id}/scan")
async def trigger_scan(website_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Relance immédiatement toutes les collectes de données pour ce site."""
    # Viewers cannot trigger scans
    team_role = await get_team_role(current_user.id, db)
    if team_role == "viewer":
        raise HTTPException(status_code=403, detail="Accès en lecture seule")

    effective_owner_id = await get_owner_id(current_user, db)
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == effective_owner_id))
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    _trigger_initial_scan(website_id)
    return {"message": "Scan lancé", "website_id": website_id}


@router.get("/{website_id}/gsc-debug")
async def gsc_debug(website_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Appelle directement l'API GSC et retourne les dates disponibles — pour diagnostiquer."""
    from datetime import date, timedelta
    effective_owner_id = await get_owner_id(current_user, db)
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == effective_owner_id))
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    cred_result = await db.execute(select(UserAPICredential).where(UserAPICredential.id == website.gsc_cred_id))
    cred = cred_result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=400, detail="Credential GSC introuvable")

    from app.core.crypto import decrypt_credentials
    from app.services.gsc_service import GSCService
    credentials_json = decrypt_credentials(cred.credentials_enc)
    gsc = GSCService(credentials_json=credentials_json, site_url=website.gsc_property)

    today = date.today()
    start = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    end = today.strftime("%Y-%m-%d")

    try:
        rows = gsc.get_keyword_positions_daily(start_date=start, end_date=end)
        dates_found = sorted(set(r["date"] for r in rows if r.get("date")))
        return {
            "gsc_property": website.gsc_property,
            "requested_range": {"start": start, "end": end},
            "total_rows_returned": len(rows),
            "dates_with_data": dates_found,
            "latest_date_in_api": dates_found[-1] if dates_found else None,
            "sample_row": rows[0] if rows else None,
        }
    except Exception as e:
        return {"error": str(e), "gsc_property": website.gsc_property}


@router.post("/{website_id}/full-resync")
async def full_resync_keywords(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Efface toutes les données mots-clés et re-synchronise directement depuis la GSC (sans Celery)."""
    from sqlalchemy import delete
    from datetime import date, timedelta
    from app.models.keyword import Keyword, KeywordPosition
    from app.core.crypto import decrypt_credentials
    from app.services.gsc_service import GSCService

    # Viewers cannot do full resync
    team_role = await get_team_role(current_user.id, db)
    if team_role == "viewer":
        raise HTTPException(status_code=403, detail="Accès en lecture seule")

    effective_owner_id = await get_owner_id(current_user, db)
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == effective_owner_id))
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    if not website.gsc_cred_id or not website.gsc_property:
        raise HTTPException(status_code=400, detail="Credential GSC ou propriété manquant")

    cred_result = await db.execute(select(UserAPICredential).where(UserAPICredential.id == website.gsc_cred_id))
    cred = cred_result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=400, detail="Credential GSC introuvable")

    credentials_json = decrypt_credentials(cred.credentials_enc)
    gsc = GSCService(credentials_json=credentials_json, site_url=website.gsc_property)

    # Effacer toutes les anciennes données
    await db.execute(delete(KeywordPosition).where(KeywordPosition.website_id == website_id))
    await db.execute(delete(Keyword).where(Keyword.website_id == website_id))
    await db.commit()

    # Re-synchroniser directement (sans Celery) — 6 mois par chunks de 7 jours
    from app.tasks.keyword_tasks import _upsert_keyword_positions
    today = date.today()
    end = today
    start = today - timedelta(days=180)
    total_rows = 0
    errors = []

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
            total_rows += len(rows)
        except Exception as e:
            errors.append(f"{chunk_start}→{chunk_end}: {str(e)[:100]}")
            await db.rollback()
        chunk_start = chunk_end + timedelta(days=1)

    # Vérifier la date la plus récente stockée
    latest = (await db.execute(
        select(func.max(KeywordPosition.recorded_date)).where(KeywordPosition.website_id == website_id)
    )).scalar()

    return {
        "message": "Resync terminé",
        "total_rows_imported": total_rows,
        "latest_date_stored": str(latest) if latest else None,
        "errors": errors,
    }


@router.delete("/{website_id}", status_code=204)
async def delete_website(website_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Viewers cannot delete websites
    team_role = await get_team_role(current_user.id, db)
    if team_role == "viewer":
        raise HTTPException(status_code=403, detail="Accès en lecture seule")

    effective_owner_id = await get_owner_id(current_user, db)
    result = await db.execute(select(Website).where(Website.id == website_id, Website.user_id == effective_owner_id))
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    await db.delete(website)
