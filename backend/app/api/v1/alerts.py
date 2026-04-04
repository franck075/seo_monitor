from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import Optional, List
from app.db.session import get_db
from app.models.alert import AlertRule, AlertEvent
from app.deps import get_current_user, get_workspace_owner_id
from app.models.user import User
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional as Opt

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertRuleCreate(BaseModel):
    website_id: Optional[int] = None
    name: str
    metric: str
    condition: str = "gt"
    threshold: Optional[float] = None
    window_minutes: int = 1440
    channels: List[str]
    cooldown_minutes: int = 240


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    metric: Optional[str] = None
    condition: Optional[str] = None
    threshold: Optional[float] = None
    window_minutes: Optional[int] = None
    channels: Optional[List[str]] = None
    cooldown_minutes: Optional[int] = None
    is_active: Optional[bool] = None


class AlertRuleOut(BaseModel):
    id: int
    website_id: Optional[int]
    name: str
    metric: str
    condition: str
    threshold: Optional[float]
    channels: List[str]
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class NotificationSettings(BaseModel):
    alert_email: Opt[EmailStr] = None
    telegram_chat_id: Opt[str] = None


@router.get("/notification-settings")
async def get_notification_settings(current_user: User = Depends(get_current_user)):
    return {
        "alert_email": getattr(current_user, "alert_email", None),
        "telegram_chat_id": current_user.telegram_chat_id,
        "account_email": current_user.email,
    }


@router.put("/notification-settings")
async def update_notification_settings(
    payload: NotificationSettings,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.alert_email is not None:
        current_user.alert_email = str(payload.alert_email) if payload.alert_email else None
    if payload.telegram_chat_id is not None:
        current_user.telegram_chat_id = payload.telegram_chat_id or None
    await db.commit()
    return {
        "alert_email": getattr(current_user, "alert_email", None),
        "telegram_chat_id": current_user.telegram_chat_id,
    }


@router.get("/rules", response_model=List[AlertRuleOut])
async def list_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    result = await db.execute(
        select(AlertRule).where(AlertRule.user_id == effective_owner_id).order_by(desc(AlertRule.created_at))
    )
    return result.scalars().all()


@router.post("/rules", response_model=AlertRuleOut)
async def create_rule(
    payload: AlertRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    rule = AlertRule(**payload.model_dump(), user_id=effective_owner_id)
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=AlertRuleOut)
async def update_rule(
    rule_id: int,
    payload: AlertRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == effective_owner_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(rule, key, value)
    await db.flush()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == effective_owner_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)


@router.get("/events")
async def list_events(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
    limit: int = 50,
):
    result = await db.execute(
        select(AlertEvent, AlertRule.metric)
        .join(AlertRule, AlertEvent.rule_id == AlertRule.id)
        .where(AlertRule.user_id == effective_owner_id)
        .order_by(desc(AlertEvent.fired_at)).limit(limit)
    )
    rows = result.all()
    return [
        {
            "id": r.AlertEvent.id,
            "rule_id": r.AlertEvent.rule_id,
            "website_id": r.AlertEvent.website_id,
            "fired_at": str(r.AlertEvent.fired_at),
            "metric_value": float(r.AlertEvent.metric_value) if r.AlertEvent.metric_value else None,
            "context_json": r.AlertEvent.context_json,
            "channels_sent": r.AlertEvent.channels_sent or [],
            "status": r.AlertEvent.status,
            "rule": {"metric": r.metric},
        }
        for r in rows
    ]
