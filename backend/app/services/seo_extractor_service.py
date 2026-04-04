import hashlib
import json
from typing import Dict, Any, List, Optional
import httpx
from bs4 import BeautifulSoup


class SEOExtractorService:
    async def extract(self, url: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient(
                timeout=20,
                follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (compatible; SEOMonitor/1.0)"},
            ) as client:
                resp = await client.get(url)
                html = resp.text
        except Exception as e:
            return {"url": url, "error": str(e)}

        soup = BeautifulSoup(html, "lxml")

        title = soup.find("title")
        title_text = title.get_text(strip=True) if title else None

        meta_desc = soup.find("meta", attrs={"name": "description"})
        meta_desc_text = meta_desc.get("content", "").strip() if meta_desc else None

        h1_tag = soup.find("h1")
        h1_text = h1_tag.get_text(strip=True) if h1_tag else None

        h2s = [h.get_text(strip=True) for h in soup.find_all("h2")][:10]
        h3s = [h.get_text(strip=True) for h in soup.find_all("h3")][:10]

        canonical = soup.find("link", rel="canonical")
        canonical_href = canonical.get("href") if canonical else None

        robots_meta = soup.find("meta", attrs={"name": "robots"})
        robots_content = robots_meta.get("content") if robots_meta else None

        og_title = soup.find("meta", property="og:title")
        og_title_text = og_title.get("content") if og_title else None

        og_desc = soup.find("meta", property="og:description")
        og_desc_text = og_desc.get("content") if og_desc else None

        schema_types = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                if isinstance(data, dict):
                    t = data.get("@type")
                    if t:
                        schema_types.append(t if isinstance(t, str) else str(t))
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            t = item.get("@type")
                            if t:
                                schema_types.append(t if isinstance(t, str) else str(t))
            except Exception:
                pass

        hreflang = []
        for link in soup.find_all("link", rel="alternate"):
            hl = link.get("hreflang")
            href = link.get("href", "")
            if hl:
                hreflang.append(f"{hl}:{href}")

        all_links = soup.find_all("a", href=True)
        links_count = len(all_links)

        all_images = soup.find_all("img")
        images_without_alt = sum(1 for img in all_images if not img.get("alt", "").strip())

        body_text = soup.get_text(separator=" ", strip=True)
        content_hash = hashlib.sha256(body_text.encode()).hexdigest()

        return {
            "url": url,
            "title": title_text,
            "meta_description": meta_desc_text,
            "h1": h1_text,
            "h2s": h2s,
            "h3s": h3s,
            "canonical": canonical_href,
            "robots_meta": robots_content,
            "og_title": og_title_text,
            "og_description": og_desc_text,
            "schema_types": schema_types,
            "hreflang": hreflang,
            "links_count": links_count,
            "images_without_alt": images_without_alt,
            "content_hash": content_hash,
            "error": None,
        }

    def detect_changes(self, old: Dict[str, Any], new: Dict[str, Any], tracked_fields: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        all_scalar_fields = ["title", "meta_description", "h1", "canonical", "robots_meta", "og_title", "og_description", "links_count", "images_without_alt"]
        all_array_fields = ["h2s", "h3s", "schema_types", "hreflang"]

        field_map = {
            "title": "title",
            "meta_desc": "meta_description",
            "h1": "h1",
            "h2": "h2s",
            "h3": "h3s",
            "canonical": "canonical",
            "robots": "robots_meta",
            "og": ["og_title", "og_description"],
            "schema": "schema_types",
            "hreflang": "hreflang",
            "links_count": "links_count",
            "alt_text": "images_without_alt",
        }

        if tracked_fields:
            active_scalar = []
            active_array = []
            for tf in tracked_fields:
                mapped = field_map.get(tf)
                if mapped is None:
                    continue
                if isinstance(mapped, list):
                    for m in mapped:
                        if m in all_scalar_fields:
                            active_scalar.append(m)
                        elif m in all_array_fields:
                            active_array.append(m)
                else:
                    if mapped in all_scalar_fields:
                        active_scalar.append(mapped)
                    elif mapped in all_array_fields:
                        active_array.append(mapped)
        else:
            active_scalar = all_scalar_fields
            active_array = all_array_fields

        changes = []
        for field in active_scalar:
            old_val = old.get(field)
            new_val = new.get(field)
            if old_val != new_val:
                changes.append({"field": field, "old_value": old_val, "new_value": new_val})

        for field in active_array:
            old_val = set(old.get(field) or [])
            new_val = set(new.get(field) or [])
            if old_val != new_val:
                changes.append({
                    "field": field,
                    "old_value": ", ".join(sorted(old_val)) if old_val else None,
                    "new_value": ", ".join(sorted(new_val)) if new_val else None,
                })

        return changes
