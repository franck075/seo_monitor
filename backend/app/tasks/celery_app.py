from celery import Celery
from app.config import settings

celery_app = Celery(
    "seo_monitor",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.keyword_tasks",
        "app.tasks.traffic_tasks",
        "app.tasks.vitals_tasks",
        "app.tasks.seo_check_tasks",
        "app.tasks.http_check_tasks",
        "app.tasks.sitemap_tasks",
        "app.tasks.link_tasks",
        "app.tasks.indexation_tasks",
        "app.tasks.hack_detection_tasks",
        "app.tasks.seo_issues_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.tasks.keyword_tasks.*": {"queue": "google_api"},
        "app.tasks.traffic_tasks.*": {"queue": "google_api"},
        "app.tasks.vitals_tasks.*": {"queue": "google_api"},
        "app.tasks.http_check_tasks.*": {"queue": "io_bound"},
        "app.tasks.sitemap_tasks.*": {"queue": "io_bound"},
        "app.tasks.link_tasks.*": {"queue": "io_bound"},
        "app.tasks.seo_check_tasks.*": {"queue": "cpu_bound"},
        "app.tasks.indexation_tasks.*": {"queue": "google_api"},
        "app.tasks.hack_detection_tasks.*": {"queue": "io_bound"},
        "app.tasks.seo_issues_tasks.*": {"queue": "io_bound"},
    },
    beat_schedule={
        "pull-keywords-every-6h": {
            "task": "app.tasks.keyword_tasks.pull_keywords_all_sites",
            "schedule": 21600,
        },
        "pull-traffic-every-6h": {
            "task": "app.tasks.traffic_tasks.pull_traffic_all_sites",
            "schedule": 21600,
        },
        "pull-vitals-every-12h": {
            "task": "app.tasks.vitals_tasks.pull_vitals_all_sites",
            "schedule": 43200,
        },
        "check-http-every-4h": {
            "task": "app.tasks.http_check_tasks.check_http_all_sites",
            "schedule": 14400,
        },
        "check-sitemaps-every-4h": {
            "task": "app.tasks.sitemap_tasks.check_sitemaps_all_sites",
            "schedule": 14400,
        },
        "check-seo-every-12h": {
            "task": "app.tasks.seo_check_tasks.check_seo_all_sites",
            "schedule": 43200,
        },
        "inspect-indexation-every-24h": {
            "task": "app.tasks.indexation_tasks.inspect_all_sites",
            "schedule": 86400,
        },
        "pull-links-every-24h": {
            "task": "app.tasks.link_tasks.pull_links_all_sites",
            "schedule": 86400,
        },
        "scan-hacks-every-24h": {
            "task": "app.tasks.hack_detection_tasks.scan_all_sites",
            "schedule": 86400,
        },
        "scan-seo-issues-every-24h": {
            "task": "app.tasks.seo_issues_tasks.scan_seo_issues_all_sites",
            "schedule": 86400,
        },
    },
)
