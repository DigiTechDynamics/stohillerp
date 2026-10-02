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


def _as_api_error(exc):
    """Business-rule failures raised below the view layer become 400s."""
    from django.core.exceptions import ValidationError as DjangoValidationError
    from rest_framework.exceptions import ValidationError

    from apps.finance.services.accounting import AccountingError

    from django.db.models import ProtectedError, RestrictedError

    if isinstance(exc, AccountingError):
        return ValidationError({"detail": str(exc)})
    if isinstance(exc, DjangoValidationError):
        return ValidationError({"detail": exc.messages})
    if isinstance(exc, (ProtectedError, RestrictedError)):
        return ValidationError({"detail": _in_use_message(exc)})
    return exc


def _in_use_message(exc):
    """'Cannot delete: it is used by 3 journal lines and 1 invoice.' from a ProtectedError."""
    from collections import Counter

    objs = getattr(exc, "protected_objects", None) or getattr(exc, "restricted_objects", None) or []
    counts = Counter(type(o)._meta for o in objs)
    parts = [f"{n} {meta.verbose_name if n == 1 else meta.verbose_name_plural}" for meta, n in counts.most_common()]
    used_by = " and ".join([", ".join(parts[:-1]), parts[-1]] if len(parts) > 1 else parts) or "other records"
    return f"This record cannot be deleted because it is used by {used_by}. Deactivate it instead if it has an active setting."


def custom_exception_handler(exc, context):
    exc = _as_api_error(exc)
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
