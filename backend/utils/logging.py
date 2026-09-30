"""
Logging helpers.

- RequestIDFilter injects the current request id into every log record, so all
  lines produced while handling one HTTP request can be correlated.
- JSONFormatter emits one JSON object per line for log aggregators
  (Loki, CloudWatch, Datadog...). Enable with LOG_FORMAT=json.
"""

import contextvars
import json
import logging
from datetime import datetime, timezone

# contextvars (not threading.local) so the id is correct under ASGI too.
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)
