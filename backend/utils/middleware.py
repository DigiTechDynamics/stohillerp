"""Stohill Properties - custom middleware."""

import logging
import re
import time
import uuid

from .logging import request_id_var

logger = logging.getLogger("stohill.request")

# Accept a caller-supplied id only if it is short and safe to log.
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class RequestIDMiddleware:
    """
    Assigns every request an id (reusing a valid inbound X-Request-ID from a
    proxy/load balancer) and echoes it back in the response header, so a user
    reporting an error can quote the id and we can find it in the logs.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = request.headers.get("X-Request-ID", "")
        request_id = incoming if _VALID_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        request.request_id = request_id
        token = request_id_var.set(request_id)
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response["X-Request-ID"] = request_id
        return response


class RequestLoggingMiddleware:
    """Logs method, path, status, user and duration for every API call."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.perf_counter()
        response = self.get_response(request)
        if request.path.startswith("/api/") and not request.path.endswith("/health/"):
            duration_ms = (time.perf_counter() - start) * 1000
            user = getattr(request, "user", None)
            user_str = f"user:{user.pk}" if user and user.is_authenticated else "anonymous"
            # Log the user's id, not their email, to keep PII out of logs.
            level = logging.WARNING if response.status_code >= 500 else logging.INFO
            logger.log(
                level,
                "%s %s %s %s %.1fms",
                request.method, request.path, response.status_code, user_str, duration_ms,
            )
        return response
