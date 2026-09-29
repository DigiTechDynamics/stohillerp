"""Local development settings. Never use on a server."""

from .base import *  # noqa: F401,F403
from .base import env

DEBUG = env.bool("DJANGO_DEBUG", default=True)
# Dev-only fallback so `manage.py runserver` works out of the box.
SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-insecure-key-do-not-use-in-production")

# Relax throttling locally so hot-reload storms don't lock you out.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].update({"anon": "1000/min", "user": "10000/min"})  # noqa: F405

# The browsable API is handy while developing.
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [  # noqa: F405
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]
