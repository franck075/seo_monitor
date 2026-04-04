import httpx
from typing import Optional
from app.config import settings


async def send_telegram_message(chat_id: str, text: str):
    if not settings.TELEGRAM_BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()


def build_alert_telegram_message(context: dict) -> str:
    site = context.get("site", "")
    metric = context.get("metric", "")
    detail = context.get("detail", "")
    detected_at = context.get("detected_at", "")
    return (
        f"*SEO Alert*\n"
        f"*Site:* {site}\n"
        f"*Metric:* {metric}\n"
        f"*Detail:* {detail}\n"
        f"*Detected:* {detected_at}"
    )
