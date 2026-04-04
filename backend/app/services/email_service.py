import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any
from app.config import settings


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


def build_alert_email_html(context: Dict[str, Any]) -> str:
    site = context.get("site", "")
    metric = context.get("metric", "")
    detail = context.get("detail", "")
    detected_at = context.get("detected_at", "")
    dashboard_url = context.get("dashboard_url", "#")

    return f"""
    <html><body style="font-family:sans-serif;padding:20px;color:#333">
    <h2 style="color:#e53e3e">SEO Alert: {metric}</h2>
    <table style="border-collapse:collapse;width:100%;max-width:600px">
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9"><b>Site</b></td><td style="padding:8px;border:1px solid #ddd">{site}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9"><b>Metric</b></td><td style="padding:8px;border:1px solid #ddd">{metric}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9"><b>Detail</b></td><td style="padding:8px;border:1px solid #ddd">{detail}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;background:#f9f9f9"><b>Detected</b></td><td style="padding:8px;border:1px solid #ddd">{detected_at}</td></tr>
    </table>
    <p style="margin-top:20px"><a href="{dashboard_url}" style="background:#3182ce;color:white;padding:10px 20px;text-decoration:none;border-radius:4px">View Dashboard</a></p>
    </body></html>
    """
