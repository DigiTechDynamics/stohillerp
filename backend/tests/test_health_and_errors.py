"""Health endpoint, request-id propagation and the API error envelope."""

import pytest

pytestmark = pytest.mark.django_db


def test_health_ok(api_client):
    response = api_client.get("/api/v1/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_request_id_generated_and_echoed(api_client):
    response = api_client.get("/api/v1/health/")
    assert len(response["X-Request-ID"]) == 32  # uuid4 hex


def test_valid_inbound_request_id_is_reused(api_client):
    response = api_client.get("/api/v1/health/", HTTP_X_REQUEST_ID="lb-abc.123")
    assert response["X-Request-ID"] == "lb-abc.123"


def test_unsafe_inbound_request_id_is_replaced(api_client):
    response = api_client.get("/api/v1/health/", HTTP_X_REQUEST_ID="bad id\nwith newline")
    assert response["X-Request-ID"] != "bad id\nwith newline"


def test_error_envelope_shape(api_client):
    """Unauthenticated calls return the standard {success, error{...}} shape."""
    response = api_client.get("/api/v1/core/me/")
    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["status_code"] == 401
    assert body["error"]["request_id"] == response["X-Request-ID"]


def test_unhandled_exception_returns_generic_500(auth_client, superuser, monkeypatch):
    """Internal details must never leak to the client on a crash."""
    from apps.core.views import CurrentUserView as view_cls

    def boom(*args, **kwargs):
        raise RuntimeError("SELECT secret FROM internals")

    monkeypatch.setattr(view_cls, "get", boom)
    response = auth_client(superuser).get("/api/v1/core/me/")
    assert response.status_code == 500
    assert "secret" not in response.content.decode()
    assert response.json()["error"]["request_id"]
