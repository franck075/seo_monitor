from fastapi import APIRouter
from app.api.v1 import auth, websites, keywords, traffic, vitals, seo_changes, http_checks, sitemaps, indexation, alerts, links, admin, billing, support, insights, hack_detection, seo_issues, team
from app.api.v1.public_cms import public_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(websites.router)
api_router.include_router(keywords.router)
api_router.include_router(traffic.router)
api_router.include_router(vitals.router)
api_router.include_router(seo_changes.router)
api_router.include_router(http_checks.router)
api_router.include_router(sitemaps.router)
api_router.include_router(indexation.router)
api_router.include_router(alerts.router)
api_router.include_router(links.router)
api_router.include_router(admin.router)
api_router.include_router(billing.router)
api_router.include_router(support.router)
api_router.include_router(insights.router)
api_router.include_router(hack_detection.router)
api_router.include_router(seo_issues.router)
api_router.include_router(team.router)
api_router.include_router(public_router)
