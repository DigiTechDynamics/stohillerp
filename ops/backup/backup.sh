#!/bin/sh
# Daily PostgreSQL backup for the `backup` service in docker-compose.yml.
#
# Every day at BACKUP_AT (HH:MM, container time zone) it writes a compressed
# custom-format dump to /backups, checks that the dump can be read back, and
# deletes dumps older than BACKUP_KEEP_DAYS. It also backs up once at start-up
# if there is no dump from today yet, so a fresh deployment is covered at once.
#
# /backups is a folder on the host (BACKUP_DIR). Copy it off the server
# (object storage, another machine): a backup on the same disk does not
# survive losing that disk.
#
# Restore (replaces the current data):
#   docker compose exec backup pg_restore --clean --if-exists -d "$POSTGRES_DB" /backups/<file>.dump
set -eu

BACKUP_AT="${BACKUP_AT:-01:30}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DIR=/backups
export PGHOST="${PGHOST:-db}" PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$POSTGRES_DB"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup: $*"; }

backup() {
  stamp=$(date +%Y%m%d_%H%M%S)
  tmp="$DIR/.${PGDATABASE}_${stamp}.dump.partial"
  final="$DIR/${PGDATABASE}_${stamp}.dump"
  if ! pg_dump -Fc -f "$tmp"; then
    rm -f "$tmp"; log "FAILED: pg_dump error"; echo "failed $stamp" > "$DIR/LAST_STATUS"; return 1
  fi
  # A dump that pg_restore can't list is useless: fail loudly rather than keep it.
  if ! tables=$(pg_restore -l "$tmp" | grep -c 'TABLE DATA'); then
    rm -f "$tmp"; log "FAILED: dump is unreadable"; echo "failed $stamp" > "$DIR/LAST_STATUS"; return 1
  fi
  mv "$tmp" "$final"
  find "$DIR" -maxdepth 1 -name "${PGDATABASE}_*.dump" -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/pruned /'
  log "ok $final ($(du -h "$final" | cut -f1), $tables tables)"
  echo "ok $stamp $final" > "$DIR/LAST_STATUS"
}

mkdir -p "$DIR"
until pg_isready -q; do log "waiting for database"; sleep 5; done

if ! ls "$DIR/${PGDATABASE}_$(date +%Y%m%d)_"*.dump >/dev/null 2>&1; then
  backup || true
fi

last_run=""
while true; do
  now=$(date +%H:%M); today=$(date +%Y%m%d)
  if [ "$now" = "$BACKUP_AT" ] && [ "$last_run" != "$today" ]; then
    backup || true
    last_run="$today"
  fi
  sleep 30
done
