from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.models.user import User
from app.models.website import Website
from app.deps import get_current_user, get_current_user_no_trial_check
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import os
import stripe

router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Prices in EUR cents (1 EUR ≈ 655.957 XOF fixed rate)
PLAN_CONFIG = {
    "starter": {
        "label": "Starter",
        "price_fcfa": 5_900,
        "price_eur_cents": 900,
        "price_annual_fcfa": 59_000,      # 10 mois (2 offerts)
        "price_annual_eur_cents": 9_000,
        "sites_limit": 1,
        "color": "gray",
    },
    "pro": {
        "label": "Pro",
        "price_fcfa": 17_900,
        "price_eur_cents": 2_700,
        "price_annual_fcfa": 179_000,
        "price_annual_eur_cents": 27_300,
        "sites_limit": 5,
        "color": "blue",
    },
    "agency": {
        "label": "Agence",
        "price_fcfa": 49_900,
        "price_eur_cents": 7_600,
        "price_annual_fcfa": 499_000,
        "price_annual_eur_cents": 76_100,
        "sites_limit": -1,
        "color": "violet",
    },
}

PLAN_FEATURES = {
    "starter": [
        "1 site monitoré",
        "Mots-clés & positions GSC",
        "Core Web Vitals",
        "Monitoring HTTP & uptime",
        "Alertes email",
        "Support standard",
    ],
    "pro": [
        "5 sites monitorés",
        "Tout du plan Starter",
        "Trafic organique GA4",
        "Sitemaps & Indexation",
        "Détection changements SEO",
        "Insights SEO avancé",
        "Monitoring SEO avancé (12 cas)",
        "Sécurité SEO (hack detection)",
        "Rapport mensuel PDF",
        "Alertes Telegram",
        "Support prioritaire",
    ],
    "agency": [
        "Sites illimités",
        "Tout du plan Pro",
        "Multi-utilisateurs",
        "Dashboard d'administration",
        "Onboarding dédié par un expert",
        "Support premium prioritaire",
    ],
}


@router.get("/me")
async def get_my_billing(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_no_trial_check),
):
    plan = getattr(current_user, "plan", "starter") or "starter"
    config = PLAN_CONFIG.get(plan, PLAN_CONFIG["starter"])

    site_count = (await db.execute(
        select(func.count(Website.id)).where(Website.user_id == current_user.id)
    )).scalar() or 0

    sites_limit = config["sites_limit"]
    usage_pct = 0 if sites_limit == -1 else int((site_count / sites_limit) * 100) if sites_limit > 0 else 0

    return {
        "plan": plan,
        "plan_label": config["label"],
        "plan_price": config["price_fcfa"],
        "plan_price_annual": config["price_annual_fcfa"],
        "plan_color": config["color"],
        "plan_features": PLAN_FEATURES.get(plan, []),
        "sites_used": site_count,
        "sites_limit": sites_limit,
        "usage_pct": min(usage_pct, 100),
        "plan_expires_at": getattr(current_user, "plan_expires_at", None),
        "trial_ends_at": getattr(current_user, "trial_ends_at", None),
        "all_plans": [
            {
                "key": k,
                "label": v["label"],
                "price": v["price_fcfa"],
                "price_annual": v["price_annual_fcfa"],
                "sites_limit": v["sites_limit"],
                "features": PLAN_FEATURES.get(k, []),
                "is_current": k == plan,
            }
            for k, v in PLAN_CONFIG.items()
        ],
    }


class CheckoutRequest(BaseModel):
    plan: str
    billing: Optional[str] = "monthly"  # "monthly" | "annual"


@router.post("/create-checkout")
async def create_checkout(
    payload: CheckoutRequest,
    current_user: User = Depends(get_current_user_no_trial_check),
):
    if payload.plan not in PLAN_CONFIG:
        raise HTTPException(status_code=400, detail="Plan invalide")
    billing = payload.billing if payload.billing in ("monthly", "annual") else "monthly"
    if not stripe.api_key or stripe.api_key.startswith("sk_test_REMPLACE"):
        raise HTTPException(status_code=503, detail="Stripe non configuré. Veuillez ajouter votre clé API Stripe.")

    config = PLAN_CONFIG[payload.plan]
    is_annual = billing == "annual"
    amount = config["price_annual_eur_cents"] if is_annual else config["price_eur_cents"]
    label_period = "an" if is_annual else "mois"
    price_fcfa = config["price_annual_fcfa"] if is_annual else config["price_fcfa"]

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "unit_amount": amount,
                    "product_data": {
                        "name": f"SEO Alert Scan — Plan {config['label']} ({'Annuel' if is_annual else 'Mensuel'})",
                        "description": f"{price_fcfa:,} FCFA/{label_period} · {config['sites_limit'] if config['sites_limit'] != -1 else 'Illimité'} site(s)".replace(",", " "),
                    },
                },
                "quantity": 1,
            }],
            client_reference_id=str(current_user.id),
            metadata={"plan": payload.plan, "user_id": str(current_user.id), "billing": billing},
            success_url=f"{FRONTEND_URL}/abonnement/succes?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/abonnement/annuler",
        )
        return {"checkout_url": session.url, "session_id": session.id}
    except stripe.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Signature Stripe invalide")
    except Exception:
        raise HTTPException(status_code=400, detail="Payload invalide")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        if session.get("payment_status") == "paid":
            user_id = int(session.get("client_reference_id", 0))
            meta = session.get("metadata", {})
            plan = meta.get("plan", "starter")
            billing = meta.get("billing", "monthly")
            if user_id and plan in PLAN_CONFIG:
                result = await db.execute(select(User).where(User.id == user_id))
                user = result.scalar_one_or_none()
                if user:
                    from datetime import timedelta
                    user.plan = plan
                    user.is_active = True
                    days = 365 if billing == "annual" else 30
                    user.plan_expires_at = datetime.now(timezone.utc) + timedelta(days=days)
                    await db.commit()

    return {"status": "ok"}
