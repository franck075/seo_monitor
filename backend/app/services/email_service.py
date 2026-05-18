import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any
from app.config import settings
from app.services.alert_i18n import (
    get_metric_info,
    format_detail_html,
    SEVERITY_COLORS,
    SEVERITY_LABELS_FR,
)


async def send_alert_email(to: str, subject: str, body_html: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(body_html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        use_tls=True,
    )


def build_alert_subject(metric: str, site: str) -> str:
    info = get_metric_info(metric)
    return f"[SEO Alert Scan] {info['label']} — {site}"


def build_alert_email_html(context: Dict[str, Any]) -> str:
    site = context.get("site", "")
    metric = context.get("metric", "")
    detected_at = context.get("detected_at", "")
    dashboard_url = context.get("dashboard_url", "#")
    raw_context = context.get("raw_context", {}) or {}

    info = get_metric_info(metric)
    color = SEVERITY_COLORS.get(info["severity"], "#374151")
    severity_label = SEVERITY_LABELS_FR.get(info["severity"], "")
    detail_rows = format_detail_html(metric, raw_context)
    detail_block = (
        f'<table style="border-collapse:collapse;width:100%;margin:0 0 20px 0;'
        f'border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">{detail_rows}</table>'
        if detail_rows
        else ""
    )

    return f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">

        <!-- Header -->
        <tr><td style="background:{color};padding:24px 28px">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1px;color:rgba(255,255,255,0.85);text-transform:uppercase">
            Alerte SEO · {severity_label}
          </p>
          <h1 style="margin:6px 0 0 0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3">
            {info['label']}
          </h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px">
          <p style="margin:0 0 6px 0;font-size:13px;color:#6b7280">Site concerné</p>
          <p style="margin:0 0 20px 0;font-size:18px;font-weight:600;color:#111827">{site}</p>

          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151">
            {info['summary']}
          </p>

          {detail_block}

          <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 16px;border-radius:6px;margin:0 0 24px 0">
            <p style="margin:0;font-size:13px;font-weight:600;color:#92400e">Que faire ?</p>
            <p style="margin:6px 0 0 0;font-size:14px;line-height:1.5;color:#78350f">
              {info['recommendation']}
            </p>
          </div>

          <p style="margin:0 0 8px 0;font-size:12px;color:#9ca3af">
            Détectée le {detected_at}
          </p>

          <p style="margin:24px 0 0 0">
            <a href="{dashboard_url}" style="display:inline-block;background:{color};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
              Voir le tableau de bord →
            </a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:18px 28px;border-top:1px solid #e5e7eb">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5">
            Vous recevez cet email parce que vous avez activé les alertes SEO pour ce site.<br>
            Vous pouvez désactiver ou personnaliser vos alertes depuis votre tableau de bord SEO Alert Scan.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>"""
