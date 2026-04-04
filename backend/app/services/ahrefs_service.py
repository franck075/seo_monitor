import requests
from typing import List, Dict, Any


class AhrefsService:
    BASE_URL = "https://api.ahrefs.com/v3"

    def __init__(self, api_key: str, target: str):
        self.target = target
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        })

    def _get(self, path: str, params: dict) -> dict:
        params.setdefault("target", self.target)
        params.setdefault("mode", "domain")
        resp = self._session.get(f"{self.BASE_URL}/{path}", params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def get_metrics(self) -> Dict[str, Any]:
        """Domain overview: backlinks, referring domains, dofollow/nofollow counts."""
        data = self._get("site-explorer/metrics", {
            "select": "backlinks,refdomains,dofollow,nofollow",
        })
        m = data.get("metrics", {})
        total = m.get("backlinks", 0)
        dofollow = m.get("dofollow", 0)
        return {
            "total_backlinks": total,
            "dofollow_backlinks": dofollow,
            "nofollow_backlinks": m.get("nofollow", total - dofollow),
            "total_referring_domains": m.get("refdomains", 0),
            "dofollow_domains": 0,
        }

    def get_backlinks(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """
        Top backlinks using the all-backlinks endpoint — richest available.
        Ordered by source traffic desc, then URL rating desc.
        """
        data = self._get("site-explorer/all-backlinks", {
            "aggregation": "all",
            "history": "live",
            "limit": min(limit, 1000),
            "order_by": "traffic:desc,url_rating_source:desc",
            "select": (
                "url_from,title,anchor,url_to,"
                "is_dofollow,is_nofollow,is_ugc,is_sponsored,is_content,link_type,"
                "domain_rating_source,url_rating_source,"
                "traffic,traffic_domain,refdomains_source,"
                "http_code,is_spam,"
                "snippet_left,snippet_right,"
                "first_seen_link,last_visited,last_seen,"
                "lost_reason,discovered_status"
            ),
        })

        results = []
        for item in data.get("backlinks", []):
            url_from = item.get("url_from", "")
            domain_from = ""
            if url_from:
                parts = url_from.split("/")
                domain_from = parts[2] if len(parts) >= 3 else url_from

            results.append({
                "url_from": url_from,
                "domain_from": domain_from,
                "url_to": item.get("url_to", ""),
                "title": item.get("title"),
                "anchor_text": item.get("anchor", ""),
                "snippet_left": item.get("snippet_left"),
                "snippet_right": item.get("snippet_right"),
                "is_dofollow": bool(item.get("is_dofollow", True)),
                "is_nofollow": bool(item.get("is_nofollow", False)),
                "is_ugc": bool(item.get("is_ugc", False)),
                "is_sponsored": bool(item.get("is_sponsored", False)),
                "is_content": bool(item.get("is_content", False)),
                "is_spam": bool(item.get("is_spam", False)),
                "link_type": item.get("link_type"),
                "http_code": item.get("http_code"),
                "domain_rating": item.get("domain_rating_source"),
                "url_rating": item.get("url_rating_source"),
                "traffic": item.get("traffic"),
                "traffic_domain": item.get("traffic_domain"),
                "refdomains_source": item.get("refdomains_source"),
                "first_seen_at": item.get("first_seen_link"),
                "last_seen_at": item.get("last_visited") or item.get("last_seen"),
                "lost_reason": item.get("lost_reason"),
                "discovered_status": item.get("discovered_status"),
            })
        return results

    def get_referring_domains(self, limit: int = 1000) -> List[Dict[str, Any]]:
        """Top referring domains ordered by domain rating."""
        data = self._get("site-explorer/referring-domains", {
            "select": "domain,backlinks,dofollow,domain_rating",
            "limit": min(limit, 1000),
            "order_by": "domain_rating:desc",
        })
        results = []
        for item in data.get("domains", []):
            results.append({
                "domain": item.get("domain", ""),
                "backlinks_count": item.get("backlinks", 1),
                "is_dofollow": bool(item.get("dofollow", True)),
                "domain_rating": item.get("domain_rating"),
            })
        return results

    def get_anchors(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Top anchor texts by backlink count."""
        data = self._get("site-explorer/anchors", {
            "select": "anchor,backlinks,refdomains,dofollow_linked_domains",
            "limit": min(limit, 100),
        })
        results = []
        for item in data.get("anchors", []):
            results.append({
                "anchor": item.get("anchor", ""),
                "backlinks_count": item.get("backlinks", 0),
                "referring_domains_count": item.get("refdomains", 0),
                "dofollow_count": item.get("dofollow_linked_domains", 0),
            })
        return results
