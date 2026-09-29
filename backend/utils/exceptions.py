"""
Stohill Properties - API exception handler.

Every error leaves the API in one consistent shape, which the frontend already
reads as `response.data.error.message`:

    {"success": false, "error": {"status_code": 400, "message": ..., "request_id": "..."}}

Unhandled exceptions are logged with a traceback and returned as a generic 500
so internal details (SQL, file paths, class names) never reach the client.
"""

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .logging import request_id_var

logger = logging.getLogger("stohill.errors")


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    request_id = request_id_var.get()

    if response is None:
        # Not a DRF APIException: a genuine bug. Log it with full traceback.
        view = context.get("view")
        logger.exception("Unhandled API error in %s", view.__class__.__name__ if view else "?")
        return Response(
            {
                "success": False,
                "error": {
                    "status_code": 500,
                    "message": "An unexpected error occurred. Please try again or contact support.",
                    "request_id": request_id,
                },
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    response.data = {
        "success": False,
        "error": {
            "status_code": response.status_code,
            "message": response.data,
            "request_id": request_id,
        },
    }
    return response
