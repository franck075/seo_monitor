import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.models.user import User
from app.models.website import Website
from app.models.cms import Announcement, BlogPost, SiteSetting, ClientLogo
from app.deps import get_current_user
from app.core.security import hash_password
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

router = APIRouter(prefix="/admin", tags=["admin"])

PLAN_LIMITS = {"starter": 1, "pro": 5, "agency": -1}  # -1 = unlimited


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    _: User = Depends(require_admin),
):
    """Upload an image file, returns its public URL."""
    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Type de fichier non autorisé. Utilisez JPG, PNG, GIF, WebP ou SVG.")

    # Limit size to 5MB
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 5MB)")

    # Generate unique filename preserving extension
    ext = os.path.splitext(file.filename or "file")[1].lower() or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"

    # Save to /app/static/uploads/
    upload_dir = "/app/static/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    # Return public URL
    base_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    return {"url": f"{base_url}/static/uploads/{filename}", "filename": filename}


class PlanUpdate(BaseModel):
    plan: str
    plan_expires_at: Optional[datetime] = None
    notes: Optional[str] = None


class UserAdminOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    role: str
    plan: str
    plan_expires_at: Optional[datetime]
    is_active: bool
    notes: Optional[str]
    created_at: datetime
    site_count: int = 0
    model_config = {"from_attributes": True}


@router.get("/stats")
async def admin_stats(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    total_users = (await db.execute(select(func.count(User.id)))).scalar()
    active_users = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar()
    total_sites = (await db.execute(select(func.count(Website.id)))).scalar()

    plan_counts = {}
    for plan in ["starter", "pro", "agency"]:
        count = (await db.execute(
            select(func.count(User.id)).where(User.plan == plan, User.is_active == True)
        )).scalar()
        plan_counts[plan] = count

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_sites": total_sites,
        "plans": plan_counts,
    }


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    out = []
    for u in users:
        site_count = (await db.execute(
            select(func.count(Website.id)).where(Website.user_id == u.id)
        )).scalar()
        data = {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "plan": getattr(u, "plan", "starter"),
            "plan_expires_at": getattr(u, "plan_expires_at", None),
            "is_active": u.is_active,
            "notes": getattr(u, "notes", None),
            "created_at": u.created_at,
            "site_count": site_count or 0,
        }
        out.append(data)
    return out


@router.put("/users/{user_id}/plan")
async def update_user_plan(
    user_id: int, payload: PlanUpdate,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    if payload.plan not in PLAN_LIMITS:
        raise HTTPException(status_code=400, detail=f"Plan invalide. Valeurs: {list(PLAN_LIMITS.keys())}")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    user.plan = payload.plan
    if payload.plan_expires_at:
        user.plan_expires_at = payload.plan_expires_at
    if payload.notes is not None:
        user.notes = payload.notes
    await db.commit()
    return {"message": "Plan mis à jour", "plan": payload.plan}


@router.put("/users/{user_id}/toggle")
async def toggle_user(
    user_id: int,
    db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    user.is_active = not user.is_active
    await db.commit()
    return {"message": "Statut modifié", "is_active": user.is_active}


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de modifier son propre rôle")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    user.role = "admin" if user.role != "admin" else "user"
    await db.commit()
    return {"message": "Rôle modifié", "role": user.role}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer son propre compte")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    await db.delete(user)
    await db.commit()
    return {"message": "Utilisateur supprimé"}


# ── Admin management ──────────────────────────────────────────────────────────

class CreateAdminPayload(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None


@router.post("/admins")
async def create_admin(
    payload: CreateAdminPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role="admin",
        plan="starter",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role}


@router.get("/admins")
async def list_admins(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.role == "admin").order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "created_at": u.created_at}
        for u in users
    ]


@router.delete("/admins/{user_id}")
async def remove_admin(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de se retirer soi-même")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    user.role = "starter"
    await db.commit()
    return {"message": "Rôle admin retiré"}


# ── Announcements CRUD ────────────────────────────────────────────────────────

class AnnouncementPayload(BaseModel):
    title: str
    content: str
    type: str = "info"
    video_url: Optional[str] = None
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


@router.get("/announcements")
async def list_announcements(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(Announcement).order_by(Announcement.created_at.desc()))
    rows = result.scalars().all()
    return [
        {
            "id": r.id, "title": r.title, "content": r.content, "type": r.type,
            "image_url": r.image_url, "video_url": r.video_url,
            "is_active": r.is_active, "starts_at": r.starts_at, "ends_at": r.ends_at,
            "created_at": r.created_at, "updated_at": r.updated_at,
        }
        for r in rows
    ]


@router.post("/announcements")
async def create_announcement(
    payload: AnnouncementPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    ann = Announcement(**payload.model_dump())
    db.add(ann)
    await db.commit()
    await db.refresh(ann)
    return {"id": ann.id, "title": ann.title, "type": ann.type}


@router.put("/announcements/{ann_id}")
async def update_announcement(
    ann_id: int,
    payload: AnnouncementPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(Announcement).where(Announcement.id == ann_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")
    for k, v in payload.model_dump().items():
        setattr(ann, k, v)
    await db.commit()
    return {"message": "Annonce mise à jour"}


@router.delete("/announcements/{ann_id}")
async def delete_announcement(
    ann_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(Announcement).where(Announcement.id == ann_id))
    ann = result.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="Annonce non trouvée")
    await db.delete(ann)
    await db.commit()
    return {"message": "Annonce supprimée"}


# ── Blog CMS CRUD ─────────────────────────────────────────────────────────────

class BlogPostPayload(BaseModel):
    slug: str
    title: str
    excerpt: Optional[str] = None
    content: str = ""
    cover_image: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    canonical_url: Optional[str] = None
    structured_data: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    author: Optional[str] = None
    status: str = "draft"


@router.get("/blog")
async def list_blog_posts(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(BlogPost).order_by(BlogPost.created_at.desc()))
    rows = result.scalars().all()
    return [
        {
            "id": r.id, "slug": r.slug, "title": r.title, "status": r.status,
            "published_at": r.published_at, "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/blog")
async def create_blog_post(
    payload: BlogPostPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = await db.execute(select(BlogPost).where(BlogPost.slug == payload.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug déjà utilisé")
    post = BlogPost(**payload.model_dump())
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return {"id": post.id, "slug": post.slug, "title": post.title}


@router.get("/blog/{post_id}")
async def get_blog_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    return {
        "id": post.id, "slug": post.slug, "title": post.title, "excerpt": post.excerpt,
        "content": post.content, "cover_image": post.cover_image, "meta_title": post.meta_title,
        "meta_description": post.meta_description, "canonical_url": post.canonical_url,
        "structured_data": post.structured_data, "tags": post.tags, "author": post.author,
        "status": post.status, "published_at": post.published_at, "created_at": post.created_at,
        "updated_at": post.updated_at,
    }


@router.put("/blog/{post_id}")
async def update_blog_post(
    post_id: int,
    payload: BlogPostPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    # Check slug uniqueness if changed
    if payload.slug != post.slug:
        existing = await db.execute(select(BlogPost).where(BlogPost.slug == payload.slug))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Slug déjà utilisé")
    for k, v in payload.model_dump().items():
        setattr(post, k, v)
    post.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Article mis à jour"}


@router.delete("/blog/{post_id}")
async def delete_blog_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    await db.delete(post)
    await db.commit()
    return {"message": "Article supprimé"}


@router.post("/blog/{post_id}/publish")
async def publish_blog_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    post.status = "published"
    post.published_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Article publié", "published_at": post.published_at}


# ── Site Settings ─────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(SiteSetting))
    rows = result.scalars().all()
    return {r.key: r.value for r in rows}


@router.put("/settings")
async def update_settings(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    for key, value in payload.items():
        result = await db.execute(select(SiteSetting).where(SiteSetting.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = str(value) if value is not None else None
        else:
            setting = SiteSetting(key=key, value=str(value) if value is not None else None)
            db.add(setting)
    await db.commit()
    return {"message": "Paramètres mis à jour"}


# ── Client Logos CRUD ─────────────────────────────────────────────────────────

class ClientLogoPayload(BaseModel):
    name: str
    logo_url: str
    website_url: Optional[str] = None
    position: int = 0
    is_active: bool = True


@router.get("/client-logos")
async def list_client_logos(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(ClientLogo).order_by(ClientLogo.position.asc()))
    rows = result.scalars().all()
    return [
        {
            "id": r.id, "name": r.name, "logo_url": r.logo_url, "website_url": r.website_url,
            "position": r.position, "is_active": r.is_active, "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/client-logos")
async def create_client_logo(
    payload: ClientLogoPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    logo = ClientLogo(**payload.model_dump())
    db.add(logo)
    await db.commit()
    await db.refresh(logo)
    return {"id": logo.id, "name": logo.name}


@router.put("/client-logos/{logo_id}")
async def update_client_logo(
    logo_id: int,
    payload: ClientLogoPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(ClientLogo).where(ClientLogo.id == logo_id))
    logo = result.scalar_one_or_none()
    if not logo:
        raise HTTPException(status_code=404, detail="Logo non trouvé")
    for k, v in payload.model_dump().items():
        setattr(logo, k, v)
    await db.commit()
    return {"message": "Logo mis à jour"}


@router.delete("/client-logos/{logo_id}")
async def delete_client_logo(
    logo_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(ClientLogo).where(ClientLogo.id == logo_id))
    logo = result.scalar_one_or_none()
    if not logo:
        raise HTTPException(status_code=404, detail="Logo non trouvé")
    await db.delete(logo)
    await db.commit()
    return {"message": "Logo supprimé"}


@router.patch("/client-logos/{logo_id}/toggle")
async def toggle_client_logo(
    logo_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(select(ClientLogo).where(ClientLogo.id == logo_id))
    logo = result.scalar_one_or_none()
    if not logo:
        raise HTTPException(status_code=404, detail="Logo non trouvé")
    logo.is_active = not logo.is_active
    await db.commit()
    return {"message": "Statut modifié", "is_active": logo.is_active}
