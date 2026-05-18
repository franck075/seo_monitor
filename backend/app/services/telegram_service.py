import httpx
from app.config import settings
from app.services.alert_i18n import (
    get_metric_info,
    format_detail_text,
    SEVERITY_LABELS_FR,
)


async def send_telegram_message(chat_id: str, text: str):
    if not settings.TELEGRAM_BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()


def build_alert_telegram_message(context: dict) -> str:
    site = context.get("site", "")
    metric = context.get("metric", "")
    detected_at = context.get("detected_at", "")
    dashboard_url = context.get("dashboard_url", "")
    raw_context = context.get("raw_context", {}) or {}

    info = get_metric_info(metric)
    severity_label = SEVERITY_LABELS_FR.get(info["severity"], "")
    detail = format_detail_text(metric, raw_context)

    lines = [
        f"🚨 *Alerte SEO — {severity_label}*",
        f"*{info['label']}*",
        "",
        f"*Site :* {site}",
    ]
    if detail:
        lines.append(f"*Détail :* {detail}")
    lines.extend([
        "",
        info["summary"],
        "",
        f"💡 _{info['recommendation']}_",
        "",
        f"_Détectée le {detected_at}_",
    ])
    if dashboard_url and dashboard_url != "#":
        lines.append(f"[Voir le tableau de bord]({dashboard_url})")
    return "\n".join(lines)
