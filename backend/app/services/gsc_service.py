import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from googleapiclient.discovery import build
from google.oauth2 import service_account


class GSCService:
    def __init__(self, credentials_json: dict, site_url: str):
        self.site_url = site_url
        credentials = service_account.Credentials.from_service_account_info(
            credentials_json,
            scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
        )
        self.service = build("searchconsole", "v1", credentials=credentials)

    def get_keyword_positions(self, days: int = 3, row_limit: int = 25000) -> List[Dict[str, Any]]:
        """Get keyword positions aggregated over the period (no daily breakdown)."""
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": ["query", "page"],
            "rowLimit": row_limit,
            "dataState": "all",
        }
        response = self.service.searchanalytics().query(siteUrl=self.site_url, body=body).execute()
        rows = response.get("rows", [])
        results = []
        for row in rows:
            keys = row.get("keys", [])
            results.append({
                "query": keys[0] if len(keys) > 0 else "",
                "page": keys[1] if len(keys) > 1 else "",
                "clicks": row.get("clicks", 0),
                "impressions": row.get("impressions", 0),
                "ctr": row.get("ctr", 0.0),
                "position": row.get("position", 0.0),
                "date": end_date,
            })
        return results

    def get_keyword_positions_daily(self, start_date: str, end_date: str, row_limit: int = 25000) -> List[Dict[str, Any]]:
        """Get keyword positions aggregated by (date, query) — matches GSC Queries tab exactly.

        Uses dimensions=["date","query"] (no page) so data is already aggregated per query,
        exactly as Google Search Console's Queries tab shows. This avoids the need to manually
        aggregate across pages and reduces row count (less risk of hitting the 25k limit).
        Paginates automatically to fetch all rows.
        """
        results = []
        start_row = 0

        while True:
            body = {
                "startDate": start_date,
                "endDate": end_date,
                "dimensions": ["date", "query"],
                "rowLimit": row_limit,
                "startRow": start_row,
                "dataState": "all",
            }
            response = self.service.searchanalytics().query(siteUrl=self.site_url, body=body).execute()
            rows = response.get("rows", [])
            if not rows:
                break

            for row in rows:
                keys = row.get("keys", [])
                results.append({
                    "date": keys[0] if len(keys) > 0 else "",
                    "query": keys[1] if len(keys) > 1 else "",
                    "page": None,  # not fetched — we aggregate by query like GSC does
                    "clicks": row.get("clicks", 0),
                    "impressions": row.get("impressions", 0),
                    "ctr": row.get("ctr", 0.0),
                    "position": row.get("position", 0.0),
                })

            # If fewer rows than limit returned, we've fetched everything
            if len(rows) < row_limit:
                break
            start_row += row_limit

        return results

    def get_period_totals(self, start_date: str, end_date: str) -> Dict[str, Any]:
        """Get exact totals for a period — matches GSC Performance report exactly."""
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": [],
            "dataState": "all",
        }
        response = self.service.searchanalytics().query(siteUrl=self.site_url, body=body).execute()
        rows = response.get("rows", [{}])
        row = rows[0] if rows else {}
        return {
            "total_clicks": int(row.get("clicks", 0)),
            "total_impressions": int(row.get("impressions", 0)),
            "avg_ctr": round(float(row.get("ctr", 0.0)) * 100, 2),
            "avg_position": round(float(row.get("position", 0.0)), 1),
        }

    def get_top_queries_for_period(self, start_date: str, end_date: str, row_limit: int = 25000) -> List[Dict[str, Any]]:
        """Get all queries with aggregated metrics for a period — matches GSC Queries tab exactly."""
        results = []
        start_row = 0
        while True:
            body = {
                "startDate": start_date,
                "endDate": end_date,
                "dimensions": ["query"],
                "rowLimit": row_limit,
                "startRow": start_row,
                "dataState": "all",
            }
            response = self.service.searchanalytics().query(siteUrl=self.site_url, body=body).execute()
            rows = response.get("rows", [])
            if not rows:
                break
            for row in rows:
                keys = row.get("keys", [])
                results.append({
                    "query": keys[0] if keys else "",
                    "clicks": int(row.get("clicks", 0)),
                    "impressions": int(row.get("impressions", 0)),
                    "ctr": round(float(row.get("ctr", 0.0)) * 100, 2),
                    "position": round(float(row.get("position", 0.0)), 1),
                })
            if len(rows) < row_limit:
                break
            start_row += row_limit
        return results

    def get_top_pages_for_period(self, start_date: str, end_date: str, row_limit: int = 25000) -> List[Dict[str, Any]]:
        """Aggregated GSC metrics per page URL — matches GSC Pages tab exactly."""
        results = []
        start_row = 0
        while True:
            body = {
                "startDate": start_date,
                "endDate": end_date,
                "dimensions": ["page"],
                "rowLimit": row_limit,
                "startRow": start_row,
                "dataState": "all",
            }
            response = self.service.searchanalytics().query(siteUrl=self.site_url, body=body).execute()
            rows = response.get("rows", [])
            if not rows:
                break
            for row in rows:
                keys = row.get("keys", [])
                results.append({
                    "page": keys[0] if keys else "",
                    "clicks": int(row.get("clicks", 0)),
                    "impressions": int(row.get("impressions", 0)),
                    "ctr": round(float(row.get("ctr", 0.0)) * 100, 2),
                    "position": round(float(row.get("position", 0.0)), 1),
                })
            if len(rows) < row_limit:
                break
            start_row += row_limit
        return results

    def get_page_metrics(self, page_url: str, start_date: str, end_date: str) -> Dict[str, Any]:
        """Totals for one page URL over a period."""
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": [],
            "dimensionFilterGroups": [{
                "filters": [{"dimension": "page", "operator": "equals", "expression": page_url}]
            }],
            "dataState": "all",
        }
        response = self.service.searchanalytics().query(siteUrl=self.site_url, body=body).execute()
        rows = response.get("rows", [])
        row = rows[0] if rows else {}
        return {
            "clicks": int(row.get("clicks", 0)),
            "impressions": int(row.get("impressions", 0)),
            "ctr": round(float(row.get("ctr", 0.0)) * 100, 2),
            "position": round(float(row.get("position", 0.0)), 1),
        }

    def get_top_queries_for_page(self, page_url: str, start_date: str, end_date: str, row_limit: int = 100) -> List[Dict[str, Any]]:
        """Top keywords driving traffic to a specific page URL."""
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": ["query"],
            "dimensionFilterGroups": [{
                "filters": [{"dimension": "page", "operator": "equals", "expression": page_url}]
            }],
            "rowLimit": row_limit,
            "dataState": "all",
        }
        response = self.service.searchanalytics().query(siteUrl=self.site_url, body=body).execute()
        rows = response.get("rows", [])
        return [
            {
                "query": (r.get("keys") or [""])[0],
                "clicks": int(r.get("clicks", 0)),
                "impressions": int(r.get("impressions", 0)),
                "ctr": round(float(r.get("ctr", 0.0)) * 100, 2),
                "position": round(float(r.get("position", 0.0)), 1),
            }
            for r in rows
        ]

    def get_site_performance(self, days: int = 1) -> Dict[str, Any]:
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": [],
            "rowLimit": 1,
        }
        response = self.service.searchanalytics().query(siteUrl=self.site_url, body=body).execute()
        rows = response.get("rows", [{}])
        row = rows[0] if rows else {}
        return {
            "total_clicks": int(row.get("clicks", 0)),
            "total_impressions": int(row.get("impressions", 0)),
            "avg_ctr": float(row.get("ctr", 0.0)),
            "avg_position": float(row.get("position", 0.0)),
            "date": end_date,
        }

    def _normalize_url_for_property(self, url: str) -> str:
        """Adapte l'URL au format de la propriété GSC (avec ou sans www)."""
        from urllib.parse import urlparse
        prop = urlparse(self.site_url)
        page = urlparse(url)
        prop_has_www = prop.netloc.startswith("www.")
        page_has_www = page.netloc.startswith("www.")
        if prop_has_www and not page_has_www:
            normalized = page._replace(netloc="www." + page.netloc)
        elif not prop_has_www and page_has_www:
            normalized = page._replace(netloc=page.netloc[4:])
        else:
            return url
        return normalized.geturl()

    # GSC API returns human-readable strings for coverageState — normalize to CAPS
    _COVERAGE_STATE_MAP = {
        "submitted and indexed": "SUBMITTED_AND_INDEXED",
        "indexed, not submitted in sitemap": "INDEXED_NOT_SUBMITTED_IN_SITEMAP",
        "crawled - currently not indexed": "CRAWLED_CURRENTLY_NOT_INDEXED",
        "discovered - currently not indexed": "DISCOVERED_CURRENTLY_NOT_INDEXED",
        "url is unknown to google": "URL_UNKNOWN",
        "blocked by robots.txt": "BLOCKED_BY_ROBOTS_TXT",
        "blocked due to noindex tag": "BLOCKED_BY_META_TAG",
        "blocked by meta tag (noindex)": "BLOCKED_BY_META_TAG",
        "blocked due to access forbidden (403)": "BLOCKED_BY_HTTP_HEADER",
        "blocked due to other 4xx issue": "BLOCKED_BY_HTTP_HEADER",
        "duplicate, google chose different canonical than user": "DUPLICATE_WITH_PROPER_CANONICAL",
        "duplicate without user-selected canonical": "DUPLICATE_WITHOUT_CANONICAL",
        "alternate page with proper canonical tag": "ALTERNATE_PAGE",
        "page with redirect": "PAGE_WITH_REDIRECT",
        "not found (404)": "NOT_FOUND",
        "soft 404": "SOFT_404",
        "server error (5xx)": "SERVER_ERROR",
    }

    def _normalize_coverage_state(self, raw: str) -> str:
        if not raw:
            return raw
        normalized = self._COVERAGE_STATE_MAP.get(raw.lower())
        return normalized if normalized else raw.upper().replace(" ", "_").replace("-", "_").replace(",", "")

    def inspect_url(self, url: str) -> Dict[str, Any]:
        """Inspect a single URL using the GSC URL Inspection API."""
        try:
            request_body = {"inspectionUrl": url, "siteUrl": self.site_url}
            response = self.service.urlInspection().index().inspect(body=request_body).execute()
            result = response.get("inspectionResult", {})
            index_status = result.get("indexStatusResult", {})
            return {
                "coverage_state": self._normalize_coverage_state(index_status.get("coverageState", "")),
                "indexing_state": index_status.get("indexingState"),
                "robots_txt_state": index_status.get("robotsTxtState"),
                "last_crawl_time": index_status.get("lastCrawlTime"),
                "page_fetch_state": index_status.get("pageFetchState"),
                "google_canonical": index_status.get("googleCanonical"),
                "user_canonical": index_status.get("userCanonical"),
                "sitemap": index_status.get("sitemap", []),
                "referring_urls": index_status.get("referringUrls", []),
                "error": None,
            }
        except Exception as e:
            return {"coverage_state": None, "error": str(e)}

    def get_indexation_issues(self) -> List[Dict[str, Any]]:
        """Get URLs with indexation issues from GSC sitemaps/inspection data."""
        try:
            response = self.service.sitemaps().list(siteUrl=self.site_url).execute()
            sitemaps = response.get("sitemap", [])
            issues = []
            for sitemap in sitemaps:
                errors = sitemap.get("errors", 0)
                warnings = sitemap.get("warnings", 0)
                if errors > 0 or warnings > 0:
                    issues.append({
                        "sitemap_url": sitemap.get("path"),
                        "errors": errors,
                        "warnings": warnings,
                        "last_submitted": sitemap.get("lastSubmitted"),
                        "last_downloaded": sitemap.get("lastDownloaded"),
                    })
            return issues
        except Exception:
            return []
