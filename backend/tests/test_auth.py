"""JWT login, refresh-token rotation/revocation and logout."""

import pytest

from tests.conftest import TEST_PASSWORD

pytestmark = pytest.mark.django_db

LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"


def _login(client, user):
    response = client.post(LOGIN, {"email": user.email, "password": TEST_PASSWORD}, format="json")
    assert response.status_code == 200, response.content
    return response.json()


def test_login_returns_token_pair(api_client, accountant):
    tokens = _login(api_client, accountant)
    assert {"access", "refresh"} <= tokens.keys()


def test_wrong_password_is_401_with_envelope(api_client, accountant):
    response = api_client.post(LOGIN, {"email": accountant.email, "password": "nope"}, format="json")
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_access_token_authenticates(api_client, accountant):
    tokens = _login(api_client, accountant)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert api_client.get("/api/v1/core/me/").status_code == 200


def test_refresh_rotates_and_old_token_is_revoked(api_client, accountant):
    """
    Regression: the blacklist app was not installed, so rotated refresh tokens
    stayed valid forever. Reusing one must now fail.
    """
    old_refresh = _login(api_client, accountant)["refresh"]

    first = api_client.post(REFRESH, {"refresh": old_refresh}, format="json")
    assert first.status_code == 200
    assert first.json()["refresh"] != old_refresh  # rotated

    replay = api_client.post(REFRESH, {"refresh": old_refresh}, format="json")
    assert replay.status_code == 401


def test_logout_revokes_refresh_token(api_client, accountant):
    refresh = _login(api_client, accountant)["refresh"]
    assert api_client.post(LOGOUT, {"refresh": refresh}, format="json").status_code == 200
    assert api_client.post(REFRESH, {"refresh": refresh}, format="json").status_code == 401


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
