"""
Stohill ERP - base settings shared by every environment.

All environment-specific values are read from environment variables (or a
backend/.env file) via django-environ. Nothing secret is hardcoded here;
production.py refuses to start if required secrets are missing.
"""

import os
from datetime import timedelta
from pathlib import Path

import environ

# backend/ directory (config/settings/base.py -> parents[2])
BASE_DIR = Path(__file__).resolve().parents[2]

env = environ.Env()
# Load backend/.env if present. Real environment variables always win.
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

# ─── Security ────────────────────────────────────────────────────────────────
# SECRET_KEY has no default here on purpose: each environment module decides.
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])

# ─── Applications ────────────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    # Required for BLACKLIST_AFTER_ROTATION to actually revoke refresh tokens.
    # Previously enabled in SIMPLE_JWT but the app was not installed, so
    # rotated tokens stayed valid.
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
]

STOHILL_APPS = [
    "apps.core",
    "apps.properties",
    "apps.crm",
    "apps.sales",
    "apps.rentals",
    "apps.finance",
    "apps.commissions",
    "apps.documents",
    "apps.hr",
    "apps.dashboard",
    "apps.fixed_assets",
    "apps.banking",
    "apps.payroll",
    "apps.projects",
    "apps.procurement",
    "apps.portal",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + STOHILL_APPS

# ─── Middleware ──────────────────────────────────────────────────────────────
MIDDLEWARE = [
    "utils.middleware.RequestIDMiddleware",  # first: tags every log line
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serves admin static in prod
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "utils.middleware.RequestLoggingMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ─── Database ────────────────────────────────────────────────────────────────
# PostgreSQL is the only supported engine. The finance posting engine relies on
# row-level locking (select_for_update) and concurrent writes, which SQLite
# cannot provide safely.
#   DATABASE_URL=postgres://user:password@host:5432/dbname
DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://stohill:stohill@localhost:5432/stohill_erp",
    )
}
# Reuse connections between requests (seconds). 0 = close after each request.
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
# Each API request is one transaction: a failure anywhere (e.g. a GL posting
# triggered by a sub-ledger save) rolls the whole request back instead of
# leaving half-written records. The save() hooks no longer swallow errors,
# which previously made this unsafe.
DATABASES["default"]["ATOMIC_REQUESTS"] = True

# ─── Authentication ──────────────────────────────────────────────────────────
AUTH_USER_MODEL = "core.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ─── REST Framework ──────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        # Role -> module access enforced server-side (see utils/permissions.py).
        "utils.permissions.HasModuleAccess",
    ],
    "DEFAULT_PAGINATION_CLASS": "utils.pagination.StandardResultsPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "EXCEPTION_HANDLER": "utils.exceptions.custom_exception_handler",
    # Basic abuse protection. The login endpoint gets its own stricter scope.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON", default="60/min"),
        "user": env("THROTTLE_USER", default="600/min"),
        "login": env("THROTTLE_LOGIN", default="10/min"),
    },
}

# ─── JWT ─────────────────────────────────────────────────────────────────────
# Short-lived access tokens limit the damage of a leaked token; the frontend
# refreshes silently using the rotating refresh token.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_MINUTES", default=15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_DAYS", default=7)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ─── CORS ────────────────────────────────────────────────────────────────────
# Only needed when the SPA is served from a different origin than the API.
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:5173", "http://127.0.0.1:5173"],
)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-request-id",
]
CORS_EXPOSE_HEADERS = ["x-request-id"]

# ─── Internationalisation ────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
# Harare and Johannesburg share UTC+2 with no DST; Harare matches the business.
TIME_ZONE = env("TIME_ZONE", default="Africa/Harare")
USE_I18N = True
USE_TZ = True

# ─── Static & media ──────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(env("MEDIA_ROOT", default=str(BASE_DIR / "media")))

# Private uploads (utils/private_media.py) are served by the API. When set,
# the API hands the transfer to nginx via X-Accel-Redirect to this internal
# location (see frontend/nginx/default.conf); empty means Django streams them.
PRIVATE_MEDIA_ACCEL_PREFIX = env("PRIVATE_MEDIA_ACCEL_PREFIX", default="")

# Uploads (KYC documents etc.): cap request size to limit abuse.
DATA_UPLOAD_MAX_MEMORY_SIZE = env.int("UPLOAD_MAX_BYTES", default=10 * 1024 * 1024)
FILE_UPLOAD_MAX_MEMORY_SIZE = DATA_UPLOAD_MAX_MEMORY_SIZE

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── Company configuration ───────────────────────────────────────────────────
# Defaults reflect the Zimbabwe (USD) deployment the seed data targets.
COMPANY_CONFIG = {
    "name": env("COMPANY_NAME", default="Stohill Properties"),
    "currency": env("COMPANY_CURRENCY", default="USD"),
    # os.environ, not env(): django-environ treats values starting with "$"
    # as references to other variables.
    "currency_symbol": os.environ.get("COMPANY_CURRENCY_SYMBOL", "$"),
    "fiscal_year_start_month": env.int("COMPANY_FISCAL_START_MONTH", default=3),  # March, matches existing data
    "vat_rate": env.float("COMPANY_VAT_RATE", default=0.155),
    "country": env("COMPANY_COUNTRY", default="ZW"),
    # Printed on invoices, statements and payslips; leave blank to omit.
    # A VAT-registered supplier must show its VAT number on tax invoices.
    "tagline": env("COMPANY_TAGLINE", default=""),
    "address": env("COMPANY_ADDRESS", default=""),
    "phone": env("COMPANY_PHONE", default=""),
    "email": env("COMPANY_EMAIL", default=""),
    "website": env("COMPANY_WEBSITE", default=""),
    "vat_number": env("COMPANY_VAT_NUMBER", default=""),
    "tax_number": env("COMPANY_TAX_NUMBER", default=""),
}

# Tenant portal and online payments (apps/portal). PORTAL_BASE_URL is where
# the SPA is served (activation and payment-return links point there).
PORTAL_BASE_URL = env("PORTAL_BASE_URL", default="http://localhost:5173")
PAYMENT_GATEWAY = env("PAYMENT_GATEWAY", default="test" if DEBUG else "paynow")
PAYNOW_INTEGRATION_ID = env("PAYNOW_INTEGRATION_ID", default="")
PAYNOW_INTEGRATION_KEY = env("PAYNOW_INTEGRATION_KEY", default="")
# Bank account (code) that receives online payments; defaults to the first active one.
ONLINE_PAYMENTS_BANK_ACCOUNT = env("ONLINE_PAYMENTS_BANK_ACCOUNT", default="")
# The in-app test gateway completes payments without money moving: dev/tests only.
PAYMENT_TEST_GATEWAY_ENABLED = env.bool("PAYMENT_TEST_GATEWAY_ENABLED", default=DEBUG)

# Purchasing: largest % difference between invoice and PO price that still matches.
PO_PRICE_TOLERANCE_PCT = env.float("PO_PRICE_TOLERANCE_PCT", default=2.0)

# Rental late fees (process_rental_overdue): share of the rent charged once
# an invoice is this many days past due. Check against the lease terms.
RENT_LATE_FEE_RATE = env.float("RENT_LATE_FEE_RATE", default=0.10)
RENT_LATE_FEE_GRACE_DAYS = env.int("RENT_LATE_FEE_GRACE_DAYS", default=7)

# ─── Email ───────────────────────────────────────────────────────────────────
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="no-reply@stohill.local")
# SMTP (with EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend). Portal
# invitations, payslips, statements and rent reminders go out this way.
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)

# ─── Logging ─────────────────────────────────────────────────────────────────
# Console-only: containers and process managers collect stdout. Writing to a
# local file breaks on read-only filesystems and with multiple workers.
LOG_LEVEL = env("LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_id": {"()": "utils.logging.RequestIDFilter"},
    },
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} rid={request_id} {message}",
            "style": "{",
        },
        "json": {"()": "utils.logging.JSONFormatter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": env("LOG_FORMAT", default="verbose"),
            "filters": ["request_id"],
        },
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "stohill": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
    },
}

# ─── Error monitoring ────────────────────────────────────────────────────────
# Unhandled errors and ERROR-level log records (including failed scheduled jobs)
# go to Sentry when SENTRY_DSN is set. Personal data is not sent.
SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=env("SENTRY_ENVIRONMENT", default="production"),
        release=env("APP_RELEASE", default=None),
        send_default_pii=False,
        traces_sample_rate=env.float("SENTRY_TRACES_SAMPLE_RATE", default=0.0),
    )