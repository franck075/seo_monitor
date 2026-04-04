from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone
from app.db.session import get_db
from app.models.website import Website
from app.models.hack_detection import HackDetection
from app.models.user import User
from app.deps import get_current_user, get_workspace_owner_id, require_plan

router = APIRouter(prefix="/websites/{website_id}/security", tags=["security"])


async def _check_ownership(website_id: int, db: AsyncSession, current_user: User, owner_id: int) -> Website:
    # Plan check: only needed for direct owners; team members' owner has agency (>= pro)
    if current_user.id == owner_id:
        require_plan(current_user, "pro")
    site = (await db.execute(
        select(Website).where(Website.id == website_id, Website.user_id == owner_id)
    )).scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Website not found")
    return site


@router.get("/hack-detections")
async def list_detections(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    rows = (await db.execute(
        select(HackDetection)
        .where(HackDetection.website_id == website_id)
        .order_by(HackDetection.detected_at.desc())
        .limit(200)
    )).scalars().all()
    return [
        {
            "id": r.id,
            "url": r.url,
            "detected_at": r.detected_at,
            "detection_type": r.detection_type,
            "severity": r.severity,
            "detail": r.detail,
            "sample": r.sample,
            "is_resolved": r.is_resolved,
            "resolved_at": r.resolved_at,
        }
        for r in rows
    ]


@router.get("/hack-detections/summary")
async def detections_summary(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    rows = (await db.execute(
        select(HackDetection)
        .where(HackDetection.website_id == website_id, HackDetection.is_resolved == False)
    )).scalars().all()
    counts = {"spam_keyword": 0, "hidden_link": 0, "injected_page": 0, "total": 0}
    for r in rows:
        counts[r.detection_type] = counts.get(r.detection_type, 0) + 1
        counts["total"] += 1
    return counts


@router.post("/hack-scan")
async def trigger_scan(
    website_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    try:
        from app.tasks.hack_detection_tasks import scan_for_hacks
        scan_for_hacks.delay(website_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du lancement du scan : {e}")
    return {"message": "Scan de sécurité lancé", "website_id": website_id}


@router.patch("/hack-detections/{detection_id}/resolve")
async def resolve_detection(
    website_id: int,
    detection_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    await _check_ownership(website_id, db, current_user, effective_owner_id)
    detection = (await db.execute(
        select(HackDetection).where(
            HackDetection.id == detection_id,
            HackDetection.website_id == website_id,
        )
    )).scalar_one_or_none()
    if not detection:
        raise HTTPException(status_code=404, detail="Détection introuvable")
    detection.is_resolved = True
    detection.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Marqué comme résolu"}
