import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime, timezone, timedelta
from app.db.session import get_db
from app.models.user import User, UserAPICredential
from app.schemas.user import UserCreate, UserLogin, TokenResponse, UserOut, CredentialCreate, CredentialOut, RegisterResponse
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.core.crypto import encrypt_credentials
from app.deps import get_current_user, get_current_user_no_trial_check, get_workspace_owner_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

VALID_PLANS = {"starter", "pro", "agency"}

@router.post("/register", response_model=RegisterResponse)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(User).where(User.email == payload.email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
        plan = payload.plan if payload.plan in VALID_PLANS else "starter"
        trial_ends = datetime.now(timezone.utc) + timedelta(days=7)
        user = User(
            email=payload.email,
            hashed_password=hash_password(payload.password),
            full_name=payload.full_name,
            role="user",
            is_active=True,
            plan=plan,
            trial_ends_at=trial_ends,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("register: database error")
        await db.rollback()
        raise HTTPException(status_code=500, detail="Inscription échouée, veuillez réessayer")
    except Exception:
        logger.exception("register: unexpected error")
        raise HTTPException(status_code=500, detail="Inscription échouée, veuillez réessayer")

    token = create_access_token({"sub": str(user.id)})
    return RegisterResponse(access_token=token, user=UserOut.model_validate(user))

@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Compte désactivé")
    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
    )

@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user_no_trial_check)):
    return current_user

@router.post("/credentials", response_model=CredentialOut)
async def add_credential(
    payload: CredentialCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cred = UserAPICredential(
        user_id=current_user.id,
        provider=payload.provider,
        label=payload.label,
        credentials_enc=encrypt_credentials(payload.credentials_json),
    )
    db.add(cred)
    await db.flush()
    await db.refresh(cred)
    return cred

@router.get("/credentials", response_model=list[CredentialOut])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    effective_owner_id: int = Depends(get_workspace_owner_id),
):
    result = await db.execute(
        select(UserAPICredential).where(UserAPICredential.user_id == effective_owner_id)
    )
    return result.scalars().all()
