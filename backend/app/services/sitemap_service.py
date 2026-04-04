import hashlib
import re
from typing import Dict, Any, List, Set, Optional
import httpx

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
}


def _clean(content: bytes) -> bytes:
    """Strip BOM variants."""
    for bom in (b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff"):
        if content.startswith(bom):
            return content[len(bom):]
    return content


def _try_lxml(content: bytes):
    """Try lxml with strict then recover mode. Returns root element or None."""
    try:
        from lxml import etree
        try:
            return etree.fromstring(content)
        except Exception:
            pass
        try:
            parser = etree.XMLParser(recover=True, encoding="utf-8")
            root = etree.fromstring(content, parser)
            if root is not None:
                return root
        except Exception:
            pass
        # Strip XML declaration and retry
        text = content.decode("utf-8", errors="replace")
        text = re.sub(r"<\?xml[^?]*\?>", "", text, count=1).strip()
        parser = etree.XMLParser(recover=True)
        root = etree.fromstring(text.encode("utf-8"), parser)
        return root
    except Exception:
        return None


def _try_stdlib(content: bytes):
    """Try stdlib xml.etree.ElementTree. Returns root or None."""
    try:
        import xml.etree.ElementTree as ET
        return ET.fromstring(content.decode("utf-8", errors="replace"))
    except Exception:
        return None


def _tag_local(tag: str) -> str:
    """Strip namespace from lxml/stdlib tag."""
    return tag.split("}")[-1] if "}" in tag else tag


def _child_text(elem, local_name: str) -> Optional[str]:
    """Get text of first child whose local tag == local_name."""
    for child in elem:
        if _tag_local(child.tag) == local_name:
            return (child.text or "").strip() or None
    return None


def _parse_urls_from_root(root) -> tuple[bool, List[str], List[dict]]:
    """
    Returns (is_index, child_sitemap_urls, page_urls).
    Works with both lxml and stdlib Element objects.
    """
    root_local = _tag_local(root.tag).lower()
    is_index = "sitemapindex" in root_local

    child_urls: List[str] = []
    page_urls: List[dict] = []

    if is_index:
        for child in root.iter():
            if _tag_local(child.tag) == "sitemap":
                loc = _child_text(child, "loc")
                if loc:
                    child_urls.append(loc)
    else:
        for child in root.iter():
            if _tag_local(child.tag) == "url":
                loc = _child_text(child, "loc")
                if not loc:
                    continue
                lastmod_raw = _child_text(child, "lastmod")
                lastmod = lastmod_raw[:10] if lastmod_raw else None
                priority_raw = _child_text(child, "priority")
                try:
                    priority = float(priority_raw) if priority_raw else None
                except (ValueError, TypeError):
                    priority = None
                page_urls.append({
                    "url": loc,
                    "lastmod": lastmod,
                    "changefreq": _child_text(child, "changefreq"),
                    "priority": priority,
                })

    return is_index, child_urls, page_urls


def _regex_extract(text: str) -> tuple[bool, List[str], List[dict]]:
    """
    Last-resort: use regex to extract <loc> from raw text.
    Detects sitemapindex vs urlset from raw content.
    """
    is_index = bool(re.search(r"<sitemapindex", text, re.IGNORECASE))
    locs = re.findall(r"<loc>\s*(https?://[^<\s]+)\s*</loc>", text)

    if is_index:
        return True, locs, []
    else:
        # Build minimal URL dicts — no lastmod/priority available
        return False, [], [{"url": u, "lastmod": None, "changefreq": None, "priority": None} for u in locs]


class SitemapService:
    async def fetch_and_parse(
        self,
        sitemap_url: str,
        *,
        _depth: int = 0,
        _visited: Optional[Set[str]] = None,
    ) -> Dict[str, Any]:
        if _visited is None:
            _visited = set()
        if sitemap_url in _visited or _depth > 3:
            return {"sitemap_url": sitemap_url, "urls": [], "url_count": 0, "content_hash": None, "error": None}
        _visited.add(sitemap_url)

        # Fetch
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=HEADERS) as client:
                resp = await client.get(sitemap_url)
                content_type = resp.headers.get("content-type", "")
                if resp.status_code in (401, 403):
                    return {"sitemap_url": sitemap_url, "urls": [], "url_count": 0, "content_hash": None,
                            "error": f"Accès refusé ({resp.status_code}) — le serveur bloque les requêtes automatisées depuis cette IP"}
                resp.raise_for_status()
                content = _clean(resp.content)
        except Exception as e:
            return {"sitemap_url": sitemap_url, "urls": [], "url_count": 0, "content_hash": None, "error": str(e)}

        # Reject HTML responses (bot protection pages, login walls, etc.)
        if "text/html" in content_type and not content[:200].lstrip().startswith((b"<?xml", b"<urlset", b"<sitemapindex")):
            return {"sitemap_url": sitemap_url, "urls": [], "url_count": 0, "content_hash": None,
                    "error": "Le serveur a renvoyé une page HTML au lieu du XML (protection anti-bot ou accès refusé)"}

        content_hash = hashlib.sha256(content).hexdigest()
        text = content.decode("utf-8", errors="replace")

        # Parse — try XML parsers, then regex fallback
        root = _try_lxml(content) or _try_stdlib(content)

        if root is not None:
            try:
                is_index, child_urls, page_urls = _parse_urls_from_root(root)
            except Exception:
                is_index, child_urls, page_urls = _regex_extract(text)
        else:
            is_index, child_urls, page_urls = _regex_extract(text)

        if is_index:
            # Recursively fetch all child sitemaps
            all_urls: List[dict] = []
            child_errors: List[str] = []
            for child_url in child_urls:
                child_data = await self.fetch_and_parse(child_url, _depth=_depth + 1, _visited=_visited)
                all_urls.extend(child_data["urls"])
                if child_data.get("error"):
                    child_errors.append(child_data["error"])

            error = None
            if not all_urls and child_urls:
                # All child fetches failed
                sample = child_errors[0] if child_errors else "timeout ou accès refusé"
                error = f"Index sitemap récupéré ({len(child_urls)} sous-sitemaps) mais le serveur bloque les requêtes : {sample}"

            return {
                "sitemap_url": sitemap_url,
                "urls": all_urls,
                "url_count": len(all_urls),
                "content_hash": content_hash,
                "error": error,
                "is_index": True,
                "child_count": len(child_urls),
            }

        if not page_urls:
            return {
                "sitemap_url": sitemap_url,
                "urls": [],
                "url_count": 0,
                "content_hash": content_hash,
                "error": "Aucune URL trouvée dans ce sitemap",
            }

        return {
            "sitemap_url": sitemap_url,
            "urls": page_urls,
            "url_count": len(page_urls),
            "content_hash": content_hash,
            "error": None,
        }

    def diff_urls(self, old_urls: Set[str], new_urls: Set[str]) -> Dict[str, List[str]]:
        return {
            "added": list(new_urls - old_urls),
            "removed": list(old_urls - new_urls),
        }
