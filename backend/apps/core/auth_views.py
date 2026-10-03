"""
JWT auth views.

The refresh token never reaches JavaScript: login and refresh put it in an
httpOnly cookie scoped to the auth endpoints, and return only the short-lived
access token in the body (kept in memory by the SPA). An XSS flaw can then use
the session while the page is open, but cannot steal a token that outlives it.

Refresh and logout read the cookie (or a "refresh" field in the body, for API
clients). A cookie-based refresh must carry `X-Requested-With: XMLHttpRequest`:
browsers only send that custom header from same-origin scripts (or allowed CORS
origins), which, with SameSite=Strict, blocks cross-site use of the cookie.
"""

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView, TokenRefreshView

COOKIE = 'stohill_refresh'
COOKIE_PATH = '/api/v1/auth/'


def set_refresh_cookie(response, refresh):
    response.set_cookie(
        COOKIE, refresh, max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        path=COOKIE_PATH, httponly=True, secure=settings.JWT_COOKIE_SECURE, samesite='Strict')


def clear_refresh_cookie(response):
    response.delete_cookie(COOKIE, path=COOKIE_PATH, samesite='Strict')


def _move_refresh_to_cookie(response):
    if response.status_code == 200 and isinstance(response.data, dict) and 'refresh' in response.data:
        set_refresh_cookie(response, response.data.pop('refresh'))
    return response


class _CookieRefreshInput:
    """Takes the refresh token from the body, else from the cookie (same-origin scripts only)."""

    def _with_cookie_token(self, request):
        if request.data.get('refresh'):
            return request.data
        token = request.COOKIES.get(COOKIE)
        if not token:
            return None
        if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
            raise AuthenticationFailed('Missing X-Requested-With header.')
        return {'refresh': token}


class ThrottledTokenObtainPairView(TokenObtainPairView):
    """Login, rate-limited per client IP (THROTTLE_LOGIN) to slow brute force."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        return _move_refresh_to_cookie(super().post(request, *args, **kwargs))


class CookieTokenRefreshView(_CookieRefreshInput, TokenRefreshView):
    """Issues a new access token and rotates the refresh cookie."""

    def post(self, request, *args, **kwargs):
        data = self._with_cookie_token(request)
        if data is None:
            raise AuthenticationFailed('No refresh token.', code='no_refresh_token')
        serializer = self.get_serializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except (InvalidToken, TokenError):
            response = self.handle_exception(AuthenticationFailed('Your session has expired. Sign in again.'))
            clear_refresh_cookie(response)
            return response
        return _move_refresh_to_cookie(Response(dict(serializer.validated_data), status=status.HTTP_200_OK))


class LogoutView(_CookieRefreshInput, TokenBlacklistView):
    """Revokes the refresh token so it cannot mint new access tokens, and clears the cookie."""

    def post(self, request, *args, **kwargs):
        data = self._with_cookie_token(request)
        response = Response({}, status=status.HTTP_200_OK)
        if data is not None:
            # Blacklists the token; one already expired or revoked needs nothing more.
            try:
                self.get_serializer(data=data).is_valid()
            except TokenError:
                pass
        clear_refresh_cookie(response)
        return response
