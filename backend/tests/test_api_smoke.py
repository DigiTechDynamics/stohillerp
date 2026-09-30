"""
Smoke sweep (ported from verify_all_endpoints.py): every parameter-free GET
endpoint under /api/ must respond without a server error for a superuser, and
must reject anonymous callers (except the explicitly public ones).
"""

import pytest
from django.urls import URLPattern, URLResolver, get_resolver

pytestmark = [pytest.mark.django_db, pytest.mark.smoke]

# Endpoints intentionally reachable without authentication.
PUBLIC = {"/api/v1/health/", "/api/v1/auth/login/", "/api/v1/auth/refresh/",
          "/api/v1/auth/verify/", "/api/v1/auth/logout/"}


def _collect(patterns, prefix=""):
    for p in patterns:
        route = prefix + str(p.pattern)
        if isinstance(p, URLResolver):
            yield from _collect(p.url_patterns, route)
        elif isinstance(p, URLPattern):
            url = "/" + route.replace("^", "").replace("$", "")
            if url.startswith("/api/") and "<" not in url and "(?P" not in url and "\\" not in url:
                yield url


API_URLS = sorted(set(_collect(get_resolver().url_patterns)))


def test_sweep_found_endpoints():
    assert len(API_URLS) > 50


@pytest.mark.parametrize("url", API_URLS)
def test_get_does_not_500(auth_client, superuser, url):
    response = auth_client(superuser).get(url)
    assert response.status_code < 500, f"{url} -> {response.status_code}"


@pytest.mark.parametrize("url", [u for u in API_URLS if u not in PUBLIC])
def test_requires_authentication(api_client, url):
    """Unauthenticated access must be refused (a few inbound webhooks are allowed)."""
    response = api_client.get(url)
    assert response.status_code in (401, 403, 405), f"{url} -> {response.status_code}"
