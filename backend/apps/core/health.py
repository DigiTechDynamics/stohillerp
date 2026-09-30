"""Liveness/readiness endpoint for load balancers and container orchestrators."""

import logging

from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET

logger = logging.getLogger("stohill.health")


@require_GET
def health(request):
    """
    Returns 200 when the app can reach the database, 503 otherwise.
    Deliberately a plain Django view: no auth, no throttling, no DRF overhead.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:  # noqa: BLE001 - any DB failure means "not ready"
        logger.exception("Health check: database unreachable")
        return JsonResponse({"status": "error", "database": "unreachable"}, status=503)
    return JsonResponse({"status": "ok", "database": "ok"})
