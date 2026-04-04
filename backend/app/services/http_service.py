import time
import httpx
from typing import Dict, Any, List


class HTTPService:
    async def check_url(self, url: str, timeout: int = 15) -> Dict[str, Any]:
        redirect_chain = []
        start = time.monotonic()
        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                follow_redirects=True,
                headers={"User-Agent": "SEOMonitor/1.0 (+https://seomonitor.io)"},
            ) as client:
                resp = await client.get(url)
                elapsed = (time.monotonic() - start) * 1000

                for r in resp.history:
                    redirect_chain.append({
                        "url": str(r.url),
                        "status_code": r.status_code,
                    })

                final_url = str(resp.url)
                status_code = resp.status_code
                redirect_url = final_url if redirect_chain else None
                is_error = status_code >= 400

                return {
                    "url": url,
                    "status_code": status_code,
                    "redirect_url": redirect_url,
                    "redirect_chain": redirect_chain if redirect_chain else None,
                    "response_time": round(elapsed, 2),
                    "is_error": is_error,
                    "error": None,
                }
        except httpx.TimeoutException:
            return {"url": url, "status_code": None, "redirect_url": None, "redirect_chain": None, "response_time": None, "is_error": True, "error": "timeout"}
        except Exception as e:
            return {"url": url, "status_code": None, "redirect_url": None, "redirect_chain": None, "response_time": None, "is_error": True, "error": str(e)}

    async def check_urls_bulk(self, urls: List[str]) -> List[Dict[str, Any]]:
        import asyncio
        tasks = [self.check_url(url) for url in urls]
        return await asyncio.gather(*tasks)
