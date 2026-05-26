from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange, Dimension, Metric, RunReportRequest, FilterExpression, Filter
)
from google.oauth2 import service_account


class GA4Service:
    def __init__(self, credentials_json: dict, property_id: str):
        self.property_id = property_id
        credentials = service_account.Credentials.from_service_account_info(
            credentials_json,
            scopes=["https://www.googleapis.com/auth/analytics.readonly"],
        )
        self.client = BetaAnalyticsDataClient(credentials=credentials)

    def get_organic_traffic_range(self, start, end) -> List[Dict[str, Any]]:
        """Get organic traffic for an explicit date range (for period comparison)."""
        from datetime import date as date_type
        start_str = start.strftime("%Y-%m-%d") if hasattr(start, "strftime") else str(start)
        end_str = end.strftime("%Y-%m-%d") if hasattr(end, "strftime") else str(end)
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=start_str, end_date=end_str)],
            dimensions=[Dimension(name="date")],
            metrics=[
                Metric(name="sessions"),
                Metric(name="totalUsers"),
                Metric(name="newUsers"),
                Metric(name="screenPageViews"),
                Metric(name="bounceRate"),
                Metric(name="averageSessionDuration"),
            ],
            dimension_filter=FilterExpression(
                filter=Filter(
                    field_name="sessionDefaultChannelGroup",
                    string_filter=Filter.StringFilter(
                        match_type=Filter.StringFilter.MatchType.EXACT,
                        value="Organic Search",
                    ),
                )
            ),
        )
        response = self.client.run_report(request)
        results = []
        for row in response.rows:
            results.append({
                "date": self._fmt_date(row.dimension_values[0].value),
                "sessions": int(row.metric_values[0].value),
                "users": int(row.metric_values[1].value),
                "new_users": int(row.metric_values[2].value),
                "pageviews": int(row.metric_values[3].value),
                "bounce_rate": float(row.metric_values[4].value),
                "avg_session_duration": float(row.metric_values[5].value),
            })
        return results

    def get_organic_totals(self, start, end) -> Dict[str, Any]:
        """Totaux réels sur une période sans dimension date (évite le double-comptage des users)."""
        start_str = start.strftime("%Y-%m-%d") if hasattr(start, "strftime") else str(start)
        end_str = end.strftime("%Y-%m-%d") if hasattr(end, "strftime") else str(end)
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=start_str, end_date=end_str)],
            dimensions=[],
            metrics=[
                Metric(name="sessions"),
                Metric(name="totalUsers"),
                Metric(name="newUsers"),
                Metric(name="screenPageViews"),
                Metric(name="bounceRate"),
                Metric(name="averageSessionDuration"),
            ],
            dimension_filter=FilterExpression(
                filter=Filter(
                    field_name="sessionDefaultChannelGroup",
                    string_filter=Filter.StringFilter(
                        match_type=Filter.StringFilter.MatchType.EXACT,
                        value="Organic Search",
                    ),
                )
            ),
        )
        response = self.client.run_report(request)
        if not response.rows:
            return {"sessions": 0, "users": 0, "new_users": 0, "pageviews": 0, "bounce_rate": 0.0, "avg_session_duration": 0.0}
        row = response.rows[0]
        return {
            "sessions": int(row.metric_values[0].value),
            "users": int(row.metric_values[1].value),
            "new_users": int(row.metric_values[2].value),
            "pageviews": int(row.metric_values[3].value),
            "bounce_rate": float(row.metric_values[4].value),
            "avg_session_duration": float(row.metric_values[5].value),
        }

    def get_page_engagement_range(self, start: str, end: str, limit: int = 500) -> List[Dict[str, Any]]:
        """Per-page engagement metrics over a date range (all channels).

        Returns sessions, views, users, engagement rate, engaged sessions,
        avg engagement time, bounce rate, pages/session per landing page.
        """
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=start, end_date=end)],
            dimensions=[Dimension(name="landingPage")],
            metrics=[
                Metric(name="sessions"),
                Metric(name="screenPageViews"),
                Metric(name="totalUsers"),
                Metric(name="engagementRate"),
                Metric(name="engagedSessions"),
                Metric(name="userEngagementDuration"),
                Metric(name="bounceRate"),
                Metric(name="screenPageViewsPerSession"),
            ],
            limit=limit,
            order_bys=[{"metric": {"metric_name": "sessions"}, "desc": True}],
        )
        response = self.client.run_report(request)
        results = []
        for row in response.rows:
            sessions = int(row.metric_values[0].value)
            eng_duration = float(row.metric_values[5].value)
            results.append({
                "page": row.dimension_values[0].value,
                "sessions": sessions,
                "pageviews": int(row.metric_values[1].value),
                "users": int(row.metric_values[2].value),
                "engagement_rate": round(float(row.metric_values[3].value) * 100, 1),
                "engaged_sessions": int(row.metric_values[4].value),
                "avg_engagement_time": round(eng_duration / sessions, 1) if sessions else 0,
                "bounce_rate": round(float(row.metric_values[6].value) * 100, 1),
                "pages_per_session": round(float(row.metric_values[7].value), 1),
            })
        return results

    def get_channel_breakdown_range(self, start: str, end: str) -> List[Dict[str, Any]]:
        """Per-channel sessions/users/engagement over a date range (all channels)."""
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=start, end_date=end)],
            dimensions=[Dimension(name="sessionDefaultChannelGroup")],
            metrics=[
                Metric(name="sessions"),
                Metric(name="totalUsers"),
                Metric(name="bounceRate"),
                Metric(name="engagementRate"),
                Metric(name="screenPageViewsPerSession"),
            ],
            order_bys=[{"metric": {"metric_name": "sessions"}, "desc": True}],
        )
        response = self.client.run_report(request)
        results = []
        for row in response.rows:
            results.append({
                "channel": row.dimension_values[0].value,
                "sessions": int(row.metric_values[0].value),
                "users": int(row.metric_values[1].value),
                "bounce_rate": round(float(row.metric_values[2].value) * 100, 1),
                "engagement_rate": round(float(row.metric_values[3].value) * 100, 1),
                "pages_per_session": round(float(row.metric_values[4].value), 1),
            })
        return results

    def get_channel_by_date(self, start: str, end: str) -> List[Dict[str, Any]]:
        """Daily sessions per channel — for the stacked time-series chart."""
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=start, end_date=end)],
            dimensions=[Dimension(name="date"), Dimension(name="sessionDefaultChannelGroup")],
            metrics=[Metric(name="sessions")],
            limit=100000,
        )
        response = self.client.run_report(request)
        results = []
        for row in response.rows:
            results.append({
                "date": self._fmt_date(row.dimension_values[0].value),
                "channel": row.dimension_values[1].value,
                "sessions": int(row.metric_values[0].value),
            })
        return results

    @staticmethod
    def _fmt_date(raw: str) -> str:
        """Convert GA4 date format YYYYMMDD → YYYY-MM-DD."""
        if len(raw) == 8 and raw.isdigit():
            return f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}"
        return raw

    def get_organic_traffic(self, days: int = 1) -> List[Dict[str, Any]]:
        from datetime import date, timedelta
        end = date.today()
        start = end - timedelta(days=days - 1)
        end_date = end.strftime("%Y-%m-%d")
        start_date = start.strftime("%Y-%m-%d")
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
            dimensions=[Dimension(name="date")],
            metrics=[
                Metric(name="sessions"),
                Metric(name="totalUsers"),
                Metric(name="newUsers"),
                Metric(name="screenPageViews"),
                Metric(name="bounceRate"),
                Metric(name="averageSessionDuration"),
            ],
            dimension_filter=FilterExpression(
                filter=Filter(
                    field_name="sessionDefaultChannelGroup",
                    string_filter=Filter.StringFilter(
                        match_type=Filter.StringFilter.MatchType.EXACT,
                        value="Organic Search",
                    ),
                )
            ),
        )
        response = self.client.run_report(request)
        results = []
        for row in response.rows:
            results.append({
                "date": self._fmt_date(row.dimension_values[0].value),
                "sessions": int(row.metric_values[0].value),
                "users": int(row.metric_values[1].value),
                "new_users": int(row.metric_values[2].value),
                "pageviews": int(row.metric_values[3].value),
                "bounce_rate": float(row.metric_values[4].value),
                "avg_session_duration": float(row.metric_values[5].value),
            })
        return results

    def get_channel_breakdown(self, days: int = 7) -> List[Dict[str, Any]]:
        """Debug: retourne toutes les channels avec leurs sessions — pour identifier le bon filtre."""
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=f"{days}daysAgo", end_date="today")],
            dimensions=[Dimension(name="sessionDefaultChannelGroup")],
            metrics=[
                Metric(name="sessions"),
                Metric(name="activeUsers"),
                Metric(name="screenPageViews"),
            ],
            order_bys=[{"metric": {"metric_name": "sessions"}, "desc": True}],
        )
        response = self.client.run_report(request)
        results = []
        for row in response.rows:
            results.append({
                "channel": row.dimension_values[0].value,
                "sessions": int(row.metric_values[0].value),
                "users": int(row.metric_values[1].value),
                "pageviews": int(row.metric_values[2].value),
            })
        return results

    def get_pages_with_any_traffic(self, start, end, limit: int = 500) -> List[str]:
        """Retourne toutes les pages de destination ayant eu des sessions (tous canaux confondus)."""
        start_str = start.strftime("%Y-%m-%d") if hasattr(start, "strftime") else str(start)
        end_str = end.strftime("%Y-%m-%d") if hasattr(end, "strftime") else str(end)
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=start_str, end_date=end_str)],
            dimensions=[Dimension(name="landingPage")],
            metrics=[Metric(name="sessions")],
            limit=limit,
            order_bys=[{"metric": {"metric_name": "sessions"}, "desc": True}],
        )
        response = self.client.run_report(request)
        return [row.dimension_values[0].value for row in response.rows]

    def get_pages_with_organic_traffic(self, start, end, limit: int = 500) -> List[str]:
        """Retourne les pages de destination ayant eu des sessions organiques."""
        start_str = start.strftime("%Y-%m-%d") if hasattr(start, "strftime") else str(start)
        end_str = end.strftime("%Y-%m-%d") if hasattr(end, "strftime") else str(end)
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=start_str, end_date=end_str)],
            dimensions=[Dimension(name="landingPage")],
            metrics=[Metric(name="sessions")],
            dimension_filter=FilterExpression(
                filter=Filter(
                    field_name="sessionDefaultChannelGroup",
                    string_filter=Filter.StringFilter(
                        match_type=Filter.StringFilter.MatchType.EXACT,
                        value="Organic Search",
                    ),
                )
            ),
            limit=limit,
            order_bys=[{"metric": {"metric_name": "sessions"}, "desc": True}],
        )
        response = self.client.run_report(request)
        return [row.dimension_values[0].value for row in response.rows]

    def get_top_pages(self, days: int = 30, limit: int = 50) -> List[Dict[str, Any]]:
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=f"{days}daysAgo", end_date="today")],
            dimensions=[Dimension(name="pagePath")],
            metrics=[
                Metric(name="sessions"),
                Metric(name="screenPageViews"),
                Metric(name="activeUsers"),
            ],
            dimension_filter=FilterExpression(
                filter=Filter(
                    field_name="sessionDefaultChannelGroup",
                    string_filter=Filter.StringFilter(
                        match_type=Filter.StringFilter.MatchType.EXACT,
                        value="Organic Search",
                    ),
                )
            ),
            limit=limit,
            order_bys=[{"metric": {"metric_name": "sessions"}, "desc": True}],
        )
        response = self.client.run_report(request)
        results = []
        for row in response.rows:
            results.append({
                "page": row.dimension_values[0].value,
                "sessions": int(row.metric_values[0].value),
                "pageviews": int(row.metric_values[1].value),
                "users": int(row.metric_values[2].value),
            })
        return results

    def get_top_pages_range(self, start: str, end: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Top pages organic avec sessions sur une plage de dates précise (pour comparer deux périodes)."""
        request = RunReportRequest(
            property=f"properties/{self.property_id}",
            date_ranges=[DateRange(start_date=start, end_date=end)],
            dimensions=[Dimension(name="pagePath")],
            metrics=[
                Metric(name="sessions"),
                Metric(name="screenPageViews"),
                Metric(name="activeUsers"),
            ],
            dimension_filter=FilterExpression(
                filter=Filter(
                    field_name="sessionDefaultChannelGroup",
                    string_filter=Filter.StringFilter(
                        match_type=Filter.StringFilter.MatchType.EXACT,
                        value="Organic Search",
                    ),
                )
            ),
            limit=limit,
            order_bys=[{"metric": {"metric_name": "sessions"}, "desc": True}],
        )
        response = self.client.run_report(request)
        return [
            {
                "page": row.dimension_values[0].value,
                "sessions": int(row.metric_values[0].value),
                "pageviews": int(row.metric_values[1].value),
                "users": int(row.metric_values[2].value),
            }
            for row in response.rows
        ]
