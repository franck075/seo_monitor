def normalize_domain(raw: str) -> str:
    """Strip protocol and trailing slash from a domain field."""
    return raw.strip().replace("https://", "").replace("http://", "").rstrip("/")


def domain_to_url(domain: str) -> str:
    """Build a clean https:// URL from a domain that may or may not have a protocol."""
    clean = normalize_domain(domain)
    return f"https://{clean}"
