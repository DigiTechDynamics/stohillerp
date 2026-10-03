"""JWT login, the httpOnly refresh cookie, rotation/revocation and logout."""

import pytest

from apps.core.auth_views import COOKIE
from tests.conftest import TEST_PASSWORD

pytestmark = pytest.mark.django_db

LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"
XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}


def _login(client, user):
    response = client.post(LOGIN, {"email": user.email, "password": TEST_PASSWORD}, format="json")
    assert response.status_code == 200, response.content
    return response.json()


def test_login_returns_access_token_and_sets_refresh_cookie(api_client, accountant):
    """The refresh token goes in an httpOnly cookie, never in the body (XSS can't read it)."""
    tokens = _login(api_client, accountant)
    assert "access" in tokens and "refresh" not in tokens
    cookie = api_client.cookies[COOKIE]
    assert cookie.value and cookie["httponly"] and cookie["samesite"] == "Strict"
    assert cookie["path"] == "/api/v1/auth/"


def test_wrong_password_is_401_with_envelope(api_client, accountant):
    response = api_client.post(LOGIN, {"email": accountant.email, "password": "nope"}, format="json")
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_access_token_authenticates(api_client, accountant):
    tokens = _login(api_client, accountant)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert api_client.get("/api/v1/core/me/").status_code == 200


def test_refresh_from_cookie_rotates_and_old_token_is_revoked(api_client, accountant):
    """
    Regression: the blacklist app was not installed, so rotated refresh tokens
    stayed valid forever. Reusing one must now fail.
    """
    _login(api_client, accountant)
    old_refresh = api_client.cookies[COOKIE].value

    first = api_client.post(REFRESH, {}, format="json", **XHR)
    assert first.status_code == 200
    assert "access" in first.json() and "refresh" not in first.json()
    assert api_client.cookies[COOKIE].value != old_refresh  # rotated

    replay = api_client.post(REFRESH, {"refresh": old_refresh}, format="json")
    assert replay.status_code == 401


def test_cookie_refresh_needs_the_same_origin_header(api_client, accountant):
    """A cross-site form post carries the cookie (if SameSite fails) but not a custom header."""
    _login(api_client, accountant)
    assert api_client.post(REFRESH, {}, format="json").status_code == 401
    assert api_client.post(REFRESH, {}, format="json", **XHR).status_code == 200


def test_refresh_without_any_token_is_401(api_client):
    assert api_client.post(REFRESH, {}, format="json", **XHR).status_code == 401


def test_logout_revokes_refresh_token_and_clears_cookie(api_client, accountant):
    _login(api_client, accountant)
    refresh = api_client.cookies[COOKIE].value
    assert api_client.post(LOGOUT, {}, format="json", **XHR).status_code == 200
    assert api_client.cookies[COOKIE].value == ""
    assert api_client.post(REFRESH, {"refresh": refresh}, format="json").status_code == 401


def test_logout_without_a_session_still_succeeds(api_client):
    assert api_client.post(LOGOUT, {}, format="json").status_code == 200

def test_login_is_throttled(api_client, accountant, settings):
    """Brute-force protection: the login scope has its own rate limit."""
    from rest_framework.settings import api_settings
    from rest_framework.throttling import ScopedRateThrottle

    rates = {**api_settings.DEFAULT_THROTTLE_RATES, "login": "3/min"}
    original = ScopedRateThrottle.THROTTLE_RATES
    ScopedRateThrottle.THROTTLE_RATES = rates
    try:
        from django.core.cache import cache

        cache.clear()
        codes = [
            api_client.post(LOGIN, {"email": accountant.email, "password": "x"}, format="json").status_code
            for _ in range(4)
        ]
    finally:
        ScopedRateThrottle.THROTTLE_RATES = original
    assert codes[:3] == [401, 401, 401]
    assert codes[3] == 429
