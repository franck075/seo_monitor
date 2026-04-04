from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from app.db.session import get_db
from app.models.user import User
from app.models.support import SupportConversation, SupportMessage
from app.deps import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/support", tags=["support"])


class MessageIn(BaseModel):
    content: str


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def _get_or_create_conversation(db: AsyncSession, user_id: int) -> SupportConversation:
    result = await db.execute(
        select(SupportConversation).where(SupportConversation.user_id == user_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        conv = SupportConversation(user_id=user_id)
        db.add(conv)
        await db.flush()
    return conv


# ── CLIENT ENDPOINTS ──────────────────────────────────────────────────────────

@router.get("/conversation")
async def get_my_conversation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = await _get_or_create_conversation(db, current_user.id)
    await db.commit()

    msgs_result = await db.execute(
        select(SupportMessage).where(SupportMessage.conversation_id == conv.id)
        .order_by(SupportMessage.created_at.asc())
    )
    messages = msgs_result.scalars().all()

    # Mark admin messages as read
    for m in messages:
        if m.sender_role == "admin" and not m.is_read:
            m.is_read = True
    conv.unread_user = 0
    await db.commit()

    return {
        "conversation_id": conv.id,
        "is_resolved": conv.is_resolved,
        "unread_user": 0,
        "messages": [
            {
                "id": m.id,
                "sender_role": m.sender_role,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


@router.post("/message")
async def send_message(
    payload: MessageIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Message vide")

    conv = await _get_or_create_conversation(db, current_user.id)
    msg = SupportMessage(
        conversation_id=conv.id,
        sender_role="user",
        content=payload.content.strip(),
    )
    db.add(msg)
    conv.unread_admin += 1
    conv.last_message_at = datetime.now(timezone.utc)
    conv.is_resolved = False
    await db.commit()
    await db.refresh(msg)

    return {
        "id": msg.id,
        "sender_role": msg.sender_role,
        "content": msg.content,
        "created_at": msg.created_at.isoformat(),
    }


@router.get("/unread")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SupportConversation).where(SupportConversation.user_id == current_user.id)
    )
    conv = result.scalar_one_or_none()
    return {"unread": conv.unread_user if conv else 0}


# ── ADMIN ENDPOINTS ───────────────────────────────────────────────────────────

@router.get("/admin/conversations")
async def admin_list_conversations(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(SupportConversation).order_by(SupportConversation.last_message_at.desc().nullslast())
    )
    convs = result.scalars().all()

    out = []
    for conv in convs:
        user_result = await db.execute(select(User).where(User.id == conv.user_id))
        user = user_result.scalar_one_or_none()

        last_msg_result = await db.execute(
            select(SupportMessage)
            .where(SupportMessage.conversation_id == conv.id)
            .order_by(SupportMessage.created_at.desc())
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()

        out.append({
            "conversation_id": conv.id,
            "user_id": conv.user_id,
            "user_email": user.email if user else "—",
            "user_name": user.full_name if user else None,
            "is_resolved": conv.is_resolved,
            "unread_admin": conv.unread_admin,
            "last_message": last_msg.content[:80] if last_msg else None,
            "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
        })
    return out


@router.get("/admin/conversations/{conversation_id}")
async def admin_get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    conv_result = await db.execute(
        select(SupportConversation).where(SupportConversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation non trouvée")

    user_result = await db.execute(select(User).where(User.id == conv.user_id))
    user = user_result.scalar_one_or_none()

    msgs_result = await db.execute(
        select(SupportMessage).where(SupportMessage.conversation_id == conv.id)
        .order_by(SupportMessage.created_at.asc())
    )
    messages = msgs_result.scalars().all()

    # Mark user messages as read
    for m in messages:
        if m.sender_role == "user" and not m.is_read:
            m.is_read = True
    conv.unread_admin = 0
    await db.commit()

    return {
        "conversation_id": conv.id,
        "user_email": user.email if user else "—",
        "user_name": user.full_name if user else None,
        "is_resolved": conv.is_resolved,
        "messages": [
            {
                "id": m.id,
                "sender_role": m.sender_role,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


@router.post("/admin/conversations/{conversation_id}/reply")
async def admin_reply(
    conversation_id: int,
    payload: MessageIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    conv_result = await db.execute(
        select(SupportConversation).where(SupportConversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation non trouvée")

    msg = SupportMessage(
        conversation_id=conv.id,
        sender_role="admin",
        content=payload.content.strip(),
    )
    db.add(msg)
    conv.unread_user += 1
    conv.last_message_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)

    return {
        "id": msg.id,
        "sender_role": msg.sender_role,
        "content": msg.content,
        "created_at": msg.created_at.isoformat(),
    }


@router.put("/admin/conversations/{conversation_id}/resolve")
async def admin_resolve(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    conv_result = await db.execute(
        select(SupportConversation).where(SupportConversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation non trouvée")
    conv.is_resolved = not conv.is_resolved
    await db.commit()
    return {"is_resolved": conv.is_resolved}
