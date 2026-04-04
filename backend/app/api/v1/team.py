import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import get_current_user, require_plan
from app.models.team import TeamInvitation, TeamMember
from app.models.user import User

router = APIRouter(prefix="/team", tags=["team"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://seoalertscan.com")


# ─── Schemas ─────────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "editor"


class RoleUpdate(BaseModel):
    role: str


class MemberOut(BaseModel):
    id: int
    member_id: int
    owner_id: int
    role: str
    created_at: datetime
    member_email: str
    member_full_name: Optional[str]

    class Config:
        from_attributes = True


class InvitationOut(BaseModel):
    id: int
    email: str
    role: str
    status: str
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class InvitationPublicOut(BaseModel):
    email: str
    owner_full_name: Optional[str]
    role: str
    expires_at: datetime
    status: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _get_team_role(user_id: int, db: AsyncSession) -> Optional[str]:
    """Return the user's role in a team (or None if not a team member)."""
    result = await db.execute(
        select(TeamMember).where(TeamMember.member_id == user_id)
    )
    membership = result.scalar_one_or_none()
    return membership.role if membership else None


# ─── Protected endpoints (agency plan required) ───────────────────────────────

@router.get("", response_model=list[MemberOut])
async def list_team_members(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_plan(current_user, "agency")
    result = await db.execute(
        select(TeamMember).where(TeamMember.owner_id == current_user.id)
    )
    members = result.scalars().all()
    out = []
    for m in members:
        member_user = (await db.execute(select(User).where(User.id == m.member_id))).scalar_one_or_none()
        out.append(MemberOut(
            id=m.id,
            member_id=m.member_id,
            owner_id=m.owner_id,
            role=m.role,
            created_at=m.created_at,
            member_email=member_user.email if member_user else "",
            member_full_name=member_user.full_name if member_user else None,
        ))
    return out


@router.post("/invite")
async def invite_member(
    payload: InviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_plan(current_user, "agency")

    if payload.role not in ("editor", "viewer"):
        raise HTTPException(status_code=422, detail="Role must be 'editor' or 'viewer'.")

    # Check if email is already a member
    existing_user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing_user:
        already_member = (await db.execute(
            select(TeamMember).where(
                TeamMember.owner_id == current_user.id,
                TeamMember.member_id == existing_user.id,
            )
        )).scalar_one_or_none()
        if already_member:
            raise HTTPException(status_code=409, detail="Cet utilisateur est déjà membre de votre équipe.")

    # Check for existing pending invitation
    existing_invite = (await db.execute(
        select(TeamInvitation).where(
            TeamInvitation.owner_id == current_user.id,
            TeamInvitation.email == payload.email,
            TeamInvitation.status == "pending",
        )
    )).scalar_one_or_none()
    if existing_invite:
        raise HTTPException(status_code=409, detail="Une invitation est déjà en attente pour cet email.")

    token = secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    invitation = TeamInvitation(
        owner_id=current_user.id,
        email=payload.email,
        role=payload.role,
        token=token,
        status="pending",
        expires_at=expires_at,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    invite_link = f"{FRONTEND_URL}/equipe/rejoindre/{token}"
    return {
        "message": "Invitation envoyée.",
        "invite_link": invite_link,
        "invitation_id": invitation.id,
        "email": payload.email,
        "role": payload.role,
        "expires_at": expires_at.isoformat(),
    }


@router.get("/invitations", response_model=list[InvitationOut])
async def list_invitations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_plan(current_user, "agency")
    result = await db.execute(
        select(TeamInvitation).where(
            TeamInvitation.owner_id == current_user.id,
            TeamInvitation.status == "pending",
        ).order_by(TeamInvitation.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/invitations/{invitation_id}", status_code=204)
async def cancel_invitation(
    invitation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_plan(current_user, "agency")
    invite = (await db.execute(
        select(TeamInvitation).where(
            TeamInvitation.id == invitation_id,
            TeamInvitation.owner_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation introuvable.")
    invite.status = "cancelled"
    await db.commit()


@router.delete("/members/{member_id}", status_code=204)
async def remove_member(
    member_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_plan(current_user, "agency")
    membership = (await db.execute(
        select(TeamMember).where(
            TeamMember.id == member_id,
            TeamMember.owner_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membre introuvable.")
    await db.delete(membership)
    await db.commit()


@router.patch("/members/{member_id}/role", response_model=MemberOut)
async def update_member_role(
    member_id: int,
    payload: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_plan(current_user, "agency")

    if payload.role not in ("editor", "viewer"):
        raise HTTPException(status_code=422, detail="Role must be 'editor' or 'viewer'.")

    membership = (await db.execute(
        select(TeamMember).where(
            TeamMember.id == member_id,
            TeamMember.owner_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Membre introuvable.")

    membership.role = payload.role
    await db.commit()
    await db.refresh(membership)

    member_user = (await db.execute(select(User).where(User.id == membership.member_id))).scalar_one_or_none()
    return MemberOut(
        id=membership.id,
        member_id=membership.member_id,
        owner_id=membership.owner_id,
        role=membership.role,
        created_at=membership.created_at,
        member_email=member_user.email if member_user else "",
        member_full_name=member_user.full_name if member_user else None,
    )


# ─── Join endpoints ───────────────────────────────────────────────────────────

@router.get("/join/{token}", response_model=InvitationPublicOut)
async def get_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    invite = (await db.execute(
        select(TeamInvitation).where(TeamInvitation.token == token)
    )).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation introuvable.")

    owner = (await db.execute(select(User).where(User.id == invite.owner_id))).scalar_one_or_none()

    return InvitationPublicOut(
        email=invite.email,
        owner_full_name=owner.full_name if owner else None,
        role=invite.role,
        expires_at=invite.expires_at,
        status=invite.status,
    )


@router.post("/join/{token}")
async def accept_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite = (await db.execute(
        select(TeamInvitation).where(TeamInvitation.token == token)
    )).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation introuvable.")

    if invite.status == "cancelled":
        raise HTTPException(status_code=410, detail="Cette invitation a été annulée.")

    if invite.status == "accepted":
        raise HTTPException(status_code=410, detail="Cette invitation a déjà été acceptée.")

    now = datetime.now(timezone.utc)
    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now:
        raise HTTPException(status_code=410, detail="Cette invitation a expiré.")

    # Check that invited email matches logged-in user
    if current_user.email.lower() != invite.email.lower():
        raise HTTPException(
            status_code=403,
            detail="L'invitation est destinée à une autre adresse email.",
        )

    # Check not already a member
    existing = (await db.execute(
        select(TeamMember).where(
            TeamMember.owner_id == invite.owner_id,
            TeamMember.member_id == current_user.id,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Vous êtes déjà membre de cette équipe.")

    # Cannot join your own team
    if current_user.id == invite.owner_id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas rejoindre votre propre équipe.")

    membership = TeamMember(
        owner_id=invite.owner_id,
        member_id=current_user.id,
        role=invite.role,
    )
    db.add(membership)

    invite.status = "accepted"
    invite.accepted_at = now

    await db.commit()
    return {"message": "Vous avez rejoint l'équipe avec succès.", "role": invite.role}
