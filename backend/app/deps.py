from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from datetime import datetime, timezone
from app.db.session import get_db
from app.core.security import decode_token
from app.models.user import User

bearer_scheme = HTTPBearer()


def _check_access(user: User) -> None:
    """Raise 403 if user has no active trial nor active subscription."""
    if user.role == "admin":
        return
    now = datetime.now(timezone.utc)

    # Active paid subscription
    if user.plan_expires_at and user.plan_expires_at.replace(tzinfo=timezone.utc) > now:
        return

    # Active trial
    if user.trial_ends_at:
        trial_end = user.trial_ends_at
        if trial_end.tzinfo is None:
            trial_end = trial_end.replace(tzinfo=timezone.utc)
        if trial_end > now:
            return

    raise HTTPException(
        status_code=403,
        detail="trial_expired",
        headers={"X-Access-Reason": "trial_expired"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    _check_access(user)
    return user


def require_plan(user: User, min_plan: str) -> None:
    """Raise 403 if user's plan is below the required minimum.
    min_plan: "pro" means starter is blocked; "agency" means starter+pro are blocked.
    """
    if user.role == "admin":
        return
    order = {"starter": 0, "pro": 1, "agency": 2}
    user_plan = getattr(user, "plan", "starter") or "starter"
    if order.get(user_plan, 0) < order.get(min_plan, 0):
        raise HTTPException(
            status_code=403,
            detail=f"Cette fonctionnalité nécessite le plan {min_plan.capitalize()} ou supérieur.",
        )


async def get_workspace_owner_id(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> int:
    """Returns the effective owner_id: for team members, returns their owner's ID."""
    from sqlalchemy import select
    from app.models.team import TeamMember
    membership = (await db.execute(
        select(TeamMember).where(TeamMember.member_id == current_user.id)
    )).scalar_one_or_none()
    return membership.owner_id if membership else current_user.id


async def get_current_user_no_trial_check(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Use this for endpoints that must be accessible even after trial expiry (billing, me)."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user
