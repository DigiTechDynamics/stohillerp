"""
Production settings.

Fails fast if a required secret is missing instead of silently falling back
to an insecure default.
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False

SECRET_KEY = env("DJANGO_SECRET_KEY", default="")
if len(SECRET_KEY) < 50 or SECRET_KEY.startswith("dev-"):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must be set to a random value of at least 50 characters."
    )

if not env("DATABASE_URL", default=""):
    raise ImproperlyConfigured("DATABASE_URL must be set in production.")

# ─── HTTPS hardening ─────────────────────────────────────────────────────────
# Assumes TLS terminates at a reverse proxy that sets X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_HSTS_SECONDS = env.int("DJANGO_HSTS_SECONDS", default=60 * 60 * 24 * 30)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = env.bool("DJANGO_HSTS_PRELOAD", default=False)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"

# Health checks come from the proxy/orchestrator over plain HTTP.
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/$"]

# Hashed, compressed static files served by WhiteNoise.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Private uploads: nginx streams them from its internal /protected-media/ location.
PRIVATE_MEDIA_ACCEL_PREFIX = env("PRIVATE_MEDIA_ACCEL_PREFIX", default="/protected-media/")

# Structured logs are easier to ship to a log aggregator.
LOGGING["handlers"]["console"]["formatter"] = env("LOG_FORMAT", default="json")  # noqa: F405
