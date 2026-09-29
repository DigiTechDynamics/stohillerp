# Changelog

## [Unreleased] - production-hardening

Branch `chore/production-hardening`. Every bug below has a regression test in
`backend/tests/`.

### Fixed: production bugs

- **Batch posting never worked.** Approved journal batches could never be
  posted, because the posting service accepted only draft entries.
- **Reversals always failed.** A posted entry could never be corrected: linking
  the reversal re-saved a posted entry, which the immutability guard rejects.
  Reversals are now also protected against double reversal.
- **Segregation-of-duties bypass.** Superusers could approve their own journal
  batch (a leftover "exception for testing"), and the request then crashed with
  a 500. Maker ≠ checker is now enforced for everyone.
- **Non-atomic batch posting.** A mid-batch failure left some entries posted,
  and a double submit could post twice and double account balances. Posting is
  now all-or-nothing with row locks.
- **Creating CRM opportunities/leads failed.** `Opportunity.save()` checked
  `if self.pk` on a UUID pk (always truthy) and raised `DoesNotExist`.
- **The CRM contacts list returned a 500 on every load** (wrong related name
  in the serializer).
- **Opportunity API** required a client-supplied `reference` that the server
  generates anyway.
- **The balance sheet crashed without `as_at_date`.** It also ignored unclosed
  revenue/expense, so it could never balance mid-year.
- **Fixed-asset disposal always crashed** (`Decimal` was never imported). The
  input is now validated.
- **Unstable pagination order** on unordered querysets could duplicate or skip
  rows between pages on PostgreSQL. This is fixed centrally in the paginator.
- **Dashboard month-over-month KPIs** excluded the last day of the previous
  month (a date compared against a datetime). They now use business-timezone
  dates.
- **Refresh-token revocation never worked.** The blacklist app wasn't installed,
  so `BLACKLIST_AFTER_ROTATION` did nothing.
- **Frontend refresh handling.**
  - It stored the *old* refresh token after refreshing.
  - Parallel 401s raced each other.
  - A wrong password on the login page forced a logout and full page reload.
- **Fresh clones didn't build.** `.gitignore` excluded `*.png`, so the logo was
  never committed. `BrandLogo` now falls back gracefully.
- **Fresh installs crashed** because `python-dateutil` and `reportlab` were
  used but not declared as dependencies.
- **ZWG payroll tax brackets were never loaded**, because the ZWG currency was
  never seeded.
- **The demo seeder** was broken by the HR/Payroll refactor. It also reset the
  admin password to `admin123!` on every run, including in production. Its
  fiscal years ended Feb 2026, so nothing dated today could be posted.

### Security

- Settings split into `base / development / test / production`, driven by
  environment variables. Production refuses to start with a weak or missing
  secret key or database URL, and enables HTTPS redirect, HSTS and secure
  cookies.
- Access tokens now last 15 minutes (was 8 hours). Refresh tokens rotate and
  are revoked on use. New `POST /api/v1/auth/logout/` revokes a refresh token.
- Rate limiting: login 10/min per IP, anonymous 60/min, authenticated 600/min.
- Unhandled API errors return a generic 500 with a request id. Internals are
  never exposed, and view class names were removed from error payloads.
- Request logs record the user id instead of the email (keeps PII out of logs).
- nginx sends security headers on every route. Uploaded media is served with a
  sandboxing CSP.
- Demo seeding is blocked when `DEBUG=False`. Demo passwords come from the
  environment or are generated randomly.

### Added

- `bootstrap_system`: idempotent, production-safe reference data. It replaces
  eight loose seed scripts.
- `seed_demo`: replaces `seed_stohill`, and now includes the HR and banking demo data.
- `GET /api/v1/health/` (checks the database) and an `X-Request-ID` on every
  response, propagated from nginx.
- Structured JSON logging (`LOG_FORMAT=json`).
- pytest suite: 247 tests on PostgreSQL.
- ruff lint gate.
- GitHub Actions CI.
- Dockerfiles (multi-stage, non-root, healthchecks), `docker-compose.yml`, and
  an nginx config for the SPA and API proxy with long-lived asset caching.

### Changed

- PostgreSQL is now required. SQLite support was removed: the posting engine
  needs row locks and concurrent writes.
- Frontend: routes and side panels are lazy-loaded, and vendor libraries are
  split into their own chunks. Initial JavaScript dropped from 1,585 KB to
  494 KB (~150 KB gzipped).
- Timezone set to `Africa/Harare` (same UTC offset as before). Company defaults
  changed to Zimbabwe/USD to match the data.
- API calls use `VITE_API_BASE_URL` if set, otherwise the same origin.

### Removed

- `backend-java/`: an incomplete Spring Boot port that duplicated the Django
  API, along with 166 committed `.class` files. It remains in git history.
- Ad-hoc debug scripts, `.vscode/`, and stray output files.
- Check scripts that were ported to pytest. Six unported ones moved to
  `backend/scripts/manual_checks/`.

### Upgrade notes (existing environments)

1. Create a PostgreSQL database and set `DATABASE_URL`. SQLite data must be
   migrated, e.g. `dumpdata` → `loaddata`.
2. `pip install -r requirements.txt`, then `python manage.py migrate` (this adds
   the token blacklist tables), then `python manage.py bootstrap_system`.
3. Set `DJANGO_SETTINGS_MODULE=config.settings.production` and a strong
   `DJANGO_SECRET_KEY` on servers.
4. Users will be asked to log in again once, because token lifetimes changed.
