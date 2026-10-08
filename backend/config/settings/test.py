"""Settings for the pytest suite."""

from .base import *  # noqa: F401,F403

DEBUG = False
SECRET_KEY = "test-secret-key-not-for-production"

# Fast hashing: password hashing dominates test time otherwise.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# No throttling in tests (DRF caches counters between requests).
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []  # noqa: F405

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
LOGGING["root"]["level"] = "WARNING"  # noqa: F405
LOGGING["loggers"]["stohill"]["level"] = "WARNING"  # noqa: F405

# Online payments go through the in-app test gateway.
PAYMENT_GATEWAY = "test"
PAYMENT_TEST_GATEWAY_ENABLED = True

# Integration startup warnings are for real deployments.
TESTING = True
