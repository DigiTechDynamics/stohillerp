"""JWT auth views with endpoint-specific throttling."""

from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView


class ThrottledTokenObtainPairView(TokenObtainPairView):
    """Login, rate-limited per client IP (THROTTLE_LOGIN) to slow brute force."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class LogoutView(TokenBlacklistView):
    """Revokes the given refresh token so it cannot mint new access tokens."""
