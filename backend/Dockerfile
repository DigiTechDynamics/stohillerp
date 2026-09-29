# ─── Stohill ERP API ─────────────────────────────────────────────────────────
# Multi-stage: build wheels in a throwaway stage so the runtime image carries
# no compilers, then run as an unprivileged user.

FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

# curl: container healthcheck only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 stohill

WORKDIR /app
COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels /wheels/* && rm -rf /wheels

COPY --chown=stohill:stohill . .
RUN chmod +x docker/entrypoint.sh \
 && mkdir -p /app/staticfiles /app/media \
 && chown -R stohill:stohill /app/staticfiles /app/media

USER stohill
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/v1/health/ || exit 1

ENTRYPOINT ["docker/entrypoint.sh"]
# Workers: (2 x CPU) + 1 is gunicorn's rule of thumb; tune via GUNICORN_WORKERS.
CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout ${GUNICORN_TIMEOUT:-60} --access-logfile - --forwarded-allow-ips='*'"]
