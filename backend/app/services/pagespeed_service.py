import httpx
from typing import Dict, Any, Optional
from app.config import settings


THRESHOLDS = {
    "lcp": {"good": 2500, "poor": 4000},
    "cls": {"good": 0.1, "poor": 0.25},
    "inp": {"good": 200, "poor": 500},
    "ttfb": {"good": 800, "poor": 1800},
    "fcp": {"good": 1800, "poor": 3000},
}


def _rating(metric: str, value: float) -> str:
    t = THRESHOLDS.get(metric, {})
    if value <= t.get("good", float("inf")):
        return "good"
    elif value <= t.get("poor", float("inf")):
        return "needs-improvement"
    return "poor"


class PageSpeedService:
    BASE_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

    async def get_vitals(self, url: str, strategy: str = "mobile") -> Dict[str, Any]:
        if not settings.PAGESPEED_API_KEY:
            raise RuntimeError(
                "PAGESPEED_API_KEY n'est pas configurée. Ajoutez-la dans backend/.env.prod "
                "(obtenez une clé sur https://developers.google.com/speed/docs/insights/v5/get-started)."
            )
        params = {"url": url, "strategy": strategy, "key": settings.PAGESPEED_API_KEY}
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(self.BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        lighthouse = data.get("lighthouseResult", {})
        categories = lighthouse.get("categories", {})
        audits = lighthouse.get("audits", {})

        def get_numeric(audit_id: str) -> Optional[float]:
            audit = audits.get(audit_id, {})
            v = audit.get("numericValue")
            return float(v) if v is not None else None

        lcp = get_numeric("largest-contentful-paint")
        cls = get_numeric("cumulative-layout-shift")
        inp = get_numeric("interaction-to-next-paint")
        ttfb = get_numeric("server-response-time")
        fcp = get_numeric("first-contentful-paint")
        score = categories.get("performance", {}).get("score")

        return {
            "url": url,
            "strategy": strategy,
            "lcp": lcp,
            "cls": cls,
            "inp": inp,
            "ttfb": ttfb,
            "fcp": fcp,
            "performance_score": int(score * 100) if score is not None else None,
            "lcp_rating": _rating("lcp", lcp) if lcp else None,
            "cls_rating": _rating("cls", cls) if cls else None,
            "inp_rating": _rating("inp", inp) if inp else None,
            "ttfb_rating": _rating("ttfb", ttfb) if ttfb else None,
        }
