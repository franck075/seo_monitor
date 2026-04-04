from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    APP_NAME: str = "SEO Monitor"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24h
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    DATABASE_URL: str = "postgresql+asyncpg://seomonitor:seomonitor@localhost:5432/seomonitor"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    CREDENTIALS_ENCRYPTION_KEY: str = "dGhpcy1pcy1hLTMyLWJ5dGUta2V5LWZvci1lbmNyeXB0aW9u"
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 465
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@seomonitor.io"
    TELEGRAM_BOT_TOKEN: str = ""
    PAGESPEED_API_KEY: str = ""
    SENTRY_DSN: str = ""
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    FRONTEND_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

# Railway fournit DATABASE_URL au format postgresql://, on convertit pour asyncpg
if settings.DATABASE_URL.startswith("postgresql://"):
    settings.DATABASE_URL = settings.DATABASE_URL.replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )
