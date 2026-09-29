#!/bin/sh
# Container entrypoint: prepare the app, then exec the CMD (gunicorn).
set -eu

# Migrations are safe to run on every start with a single API replica. When
# you scale out, set RUN_MIGRATIONS=0 here and run them once as a release job.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "Applying database migrations..."
  python manage.py migrate --noinput
  echo "Loading reference data..."
  python manage.py bootstrap_system
fi

python manage.py collectstatic --noinput --verbosity 0

exec "$@"
