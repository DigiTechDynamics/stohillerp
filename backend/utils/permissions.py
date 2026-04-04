"""
Stohil Properties - Executive Mode Permission Layer
Enforces "View-Only" vs "Edit" mode globally across all API endpoints.
- SAFE_METHODS (GET, HEAD, OPTIONS): Always allowed.
- POST, PUT, PATCH, DELETE: Only if request.user.executive_mode is True.
"""
from rest_framework import permissions

class ExecutiveModePermission(permissions.BasePermission):
    """
    Global permission that blocks data mutation if the user is not in Executive Mode.
    Excludes certain critical system actions like profile updates and notification management.
    """

    # Endpoints that are ALWAYS allowed to mutate (e.g. self-service, notifications)
    EXEMPT_PATHS = [
        '/api/v1/core/me/',             # Allow profile updates (inc. toggling executive_mode itself!)
        '/api/v1/auth/reset-password/',  # Allow password reset
        '/api/v1/notifications/',        # Allow marking notifications as read
    ]

    def has_permission(self, request, view):
        # 1. Always allow SAFE methods (Viewing data)
        if request.method in permissions.SAFE_METHODS:
            return True

        # 2. Always allow exempt paths (Management actions)
        # We check if the current request path starts with any of the exempt prefixes
        if any(request.path.startswith(path) for path in self.EXEMPT_PATHS):
            return True

        # 3. For all other mutations, check the executive_mode flag
        return getattr(request.user, 'executive_mode', False)
