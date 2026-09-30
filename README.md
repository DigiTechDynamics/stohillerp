# Stohill Properties ERP

Full-stack ERP for real-estate companies: property operations, CRM pipeline,
sales, rentals and owner trust accounting, double-entry finance (AP/AR/GL,
settlement, FX, approvals, bank reconciliation), purchasing with 3-way match,
development projects, fixed assets, commissions, documents/KYC, HR, Zimbabwe
payroll (PAYE, AIDS levy, NSSA in USD and ZWG), and a tenant self-service
portal with online payment (Paynow).

| Layer    | Stack |
|----------|-------|
| API      | Python 3.12, Django 5, Django REST Framework, SimpleJWT |
| Database | PostgreSQL 16 (the only supported engine) |
| Web      | React 18 (JSX), Vite 5, Tailwind CSS, TanStack Query, Zustand, Radix UI |
| Runtime  | gunicorn + WhiteNoise, nginx (SPA + reverse proxy), Docker Compose |
| Quality  | pytest + pytest-django (444 tests), Vitest (11 tests), ruff, GitHub Actions |

---

## Architecture

```
Browser ──► nginx (web)  ──/api, /admin, /static──►  gunicorn / Django (api) ──► PostgreSQL (db)
              │  serves the React SPA                        │
              └──/media (shared volume, read-only) ◄──────────┘ uploads
```

The browser only ever talks to **one origin** (nginx), so there's no CORS in
production and cookies/CSRF behave predictably.

```
stohillerp/
├── docker-compose.yml          # db + api + web
├── .env.example                # compose variables (copy to .env)
├── .github/workflows/ci.yml    # lint, tests on Postgres, builds
├── docs/MODULES.md             # per-module feature & API reference
├── backend/
│   ├── Dockerfile              # multi-stage, non-root, healthcheck
│   ├── docker/entrypoint.sh    # migrate → bootstrap_system → collectstatic
│   ├── config/
│   │   ├── settings/           # base | development | test | production
│   │   ├── urls.py             # /api/v1/... routing, health, auth
│   │   └── wsgi.py / asgi.py
│   ├── apps/                   # one Django app per business domain
│   │   ├── core/               # users, RBAC, SoD rules, audit, seeds, commands
│   │   ├── finance/            # GL, AP/AR, batches; services/accounting.py = posting engine
│   │   ├── banking/  crm/  sales/  rentals/  properties/  commissions/
│   │   ├── documents/  hr/  payroll/  fixed_assets/  dashboard/
│   │   ├── procurement/        # purchase orders, goods receipts, 3-way match
│   │   ├── projects/           # development projects, WIP capitalisation
│   │   ├── portal/             # tenant portal API, online payments (Paynow)
│   │   └── */seeds.py          # idempotent reference data per app
│   ├── utils/                  # middleware (request id, logging), errors, pagination
│   ├── tests/                  # pytest suite
│   ├── scripts/manual_checks/  # legacy checks not yet ported to pytest
│   ├── requirements.txt        # runtime (pinned)
│   └── requirements-dev.txt    # + pytest, ruff
└── frontend/
    ├── Dockerfile  nginx/      # build → nginx with security headers & caching
    └── src/
        ├── pages/              # one route per module (lazy-loaded)
        ├── components/         # layout/, common/, modules/<domain>/
        ├── services/api.js     # axios client, token refresh, signOut
        └── stores/             # Zustand auth + UI state
```

**Design rules worth knowing**

- All ledger writes go through `apps/finance/services/accounting.py`
  (`AccountingService`). It validates balance and period, runs atomically, and
  locks rows so concurrent requests can't double-post.
- Posted journal entries are immutable. Corrections are reversals.
- Journal batches enforce maker ≠ checker for **every** user, superusers included.

---

## Quick start (Docker)

Requires Docker with Compose v2.

```bash
cp .env.example .env
# Edit .env: set DJANGO_SECRET_KEY and POSTGRES_PASSWORD. Generate a key with:
python3 -c "import secrets; print(secrets.token_urlsafe(64))"

docker compose up -d --build
docker compose exec api python manage.py createsuperuser
open http://localhost:8080
```

On every start the API container applies migrations and runs
`bootstrap_system` (reference data). Both are idempotent.

Optional demo data (never on a real production database):

```bash
docker compose exec api python manage.py seed_demo --force
```

---

## Local development

Prerequisites: Python 3.12, Node 20+ (22 recommended), PostgreSQL 16.

### 1. Database

```bash
psql -U postgres -c "CREATE USER stohill WITH PASSWORD 'stohill' CREATEDB;"
psql -U postgres -c "CREATE DATABASE stohill_erp OWNER stohill;"
```

(`CREATEDB` lets the test runner create its own test database.)

### 2. Backend (http://localhost:8000)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env              # defaults match the database above
python manage.py migrate
python manage.py seed_demo        # reference data + demo data (DEBUG only)
python manage.py runserver
```

`seed_demo` prints the generated passwords for `admin@stohill.co.za` and
`ceo@stohill.co.za` once. Set `SEED_ADMIN_PASSWORD` / `SEED_EXEC_PASSWORD` in
`.env` to choose them. Re-running never resets an existing user's password.

### 3. Frontend (http://localhost:5173)

```bash
cd frontend
npm ci
npm run dev                       # proxies /api to localhost:8000
```

### Brand logo

Put the official logo at `frontend/src/assets/logo.svg` (or `.png` / `.webp`)
and commit it. Without it the UI shows a typographic monogram. It never blocks
the build.

---

## Configuration

Backend settings come from environment variables (or `backend/.env`); see
`backend/.env.example` for the full list. The important ones:

| Variable | Default | Notes |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.development` (manage.py), `...production` (wsgi) | |
| `DJANGO_SECRET_KEY` | dev fallback only | **Required** in production (≥ 50 chars) |
| `DATABASE_URL` | `postgres://stohill:stohill@localhost:5432/stohill_erp` | **Required** in production |
| `DJANGO_ALLOWED_HOSTS` / `DJANGO_CSRF_TRUSTED_ORIGINS` | localhost | Comma-separated |
| `JWT_ACCESS_MINUTES` / `JWT_REFRESH_DAYS` | 15 / 7 | Refresh tokens rotate and are revoked on use |
| `THROTTLE_LOGIN` / `THROTTLE_ANON` / `THROTTLE_USER` | 10/min, 60/min, 600/min | |
| `LOG_LEVEL` / `LOG_FORMAT` | INFO / `verbose` (`json` in production) | |
| `TIME_ZONE` | `Africa/Harare` | Business dates (dashboards, "today") |
| `COMPANY_CURRENCY`, `COMPANY_FISCAL_START_MONTH`, ... | USD, 3 (March) | |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `DEFAULT_FROM_EMAIL` | console backend | Set SMTP in production: portal invitations, payslips and statements are emailed |
| `PORTAL_BASE_URL` | `http://localhost:5173` | Public URL of the SPA; activation and payment-return links point here |
| `PAYMENT_GATEWAY` | `test` when `DEBUG`, else `paynow` | The test gateway is forced off in production |
| `PAYNOW_INTEGRATION_ID` / `PAYNOW_INTEGRATION_KEY` | empty | Paynow must reach `/api/v1/payments/paynow/result/` |
| `ONLINE_PAYMENTS_BANK_ACCOUNT` | first active bank account | Bank account code that online payments are receipted to |
| `PO_PRICE_TOLERANCE_PCT` | 2 | Invoice vs PO price difference still accepted by the 3-way match |

Production (`config.settings.production`) refuses to start without a strong
secret key and a database URL. It enables HTTPS redirect, HSTS, secure cookies
and hashed static files. TLS is expected to terminate at a load balancer or
proxy in front of nginx that sets `X-Forwarded-Proto`.

---

## Management commands

| Command | Safe in prod | Purpose |
|---|---|---|
| `bootstrap_system` | ✅ | Currencies (USD, ZWG, ZAR), access modules, roles and default module access, number sequences, starter chart of accounts, journals, default posting profile, VAT codes, current fiscal year, ZW payroll tables and GL mapping, default CRM pipeline. Idempotent; never overwrites admin customisations. |
| `seed_demo [--force]` | ❌ | Bootstrap plus demo properties, CRM, leases, sales, HR, banking. Refuses when `DEBUG=False` unless `--force`. |
| `generate_rental_invoices [--as-of]` | ✅ | Bills active leases up to a date, applies annual escalation, posts to AR/GL. Idempotent (schedule daily, before the overdue job). |
| `process_rental_overdue` | ✅ | Rent reminders; applies and posts late fees on overdue rental invoices (schedule daily). |
| `run_daily_jobs` | ✅ | Billing, overdue processing, depreciation to last month-end, recurring and auto-reversing journals. Idempotent. |
| `run_scheduler [--at HH:MM]` | ✅ | Runs `run_daily_jobs` once a day; the `scheduler` service in `docker-compose.yml` uses it. |

---

## Testing

```bash
cd backend
pytest                    # uses config.settings.test and a Postgres test DB
pytest --create-db        # after model changes
pytest -m smoke           # just the endpoint sweep
pytest --cov=apps --cov=utils
ruff check .
```

The suite seeds the same data as `seed_demo` once per session. Each test runs
in a rolled-back transaction. It covers:

- Zimbabwe PAYE, AIDS levy and NSSA.
- Segregation-of-duties (SoD) rules.
- Journal posting, immutability and reversals.
- The maker/checker batch workflow.
- JWT rotation and revocation, and login throttling.
- The seed commands.
- A regression test for every bug fixed in the hardening pass (see `CHANGELOG.md`).
- A sweep asserting that every API endpoint neither crashes nor allows anonymous access.

Frontend: `cd frontend && npm test` (Vitest + Testing Library).

CI (`.github/workflows/ci.yml`) runs lint, the missing-migration check, the
tests on PostgreSQL, a production `check --deploy`, the frontend tests and
build, and the Docker builds.

---

## API

- Base path: `/api/v1/`. JSON only. JWT bearer auth.
- `POST auth/login/` → `{access, refresh}`. `POST auth/refresh/` → a new pair (rotated).
  `POST auth/logout/` with `{refresh}` revokes it.
- `GET health/` is unauthenticated and returns 503 if the database is unreachable.
- Errors always use this shape; quote the `request_id` when reporting a problem:
  `{"success": false, "error": {"status_code", "message", "request_id"}}`
- Lists are paginated: `{count, total_pages, current_page, next, previous, results}`
  (`?page=`, `?page_size=` up to 200).

Per-module endpoints are documented in [docs/MODULES.md](docs/MODULES.md).

---

## Known limitations & roadmap

The full comparison against Business Central, D365 F&O, Odoo and Sage
Evolution, with a prioritised gap list, is in [docs/GAP_ANALYSIS.md](docs/GAP_ANALYSIS.md).

These are ordered by risk. See `CHANGELOG.md` for what is already fixed.

1. **JWTs are stored in `localStorage`**, so any XSS flaw could steal them.
   Plan: httpOnly refresh cookie plus an in-memory access token.
2. **Not built: multi-company and ZIMRA fiscalisation (FDMS).** See
   GAP_ANALYSIS.md.
3. **N+1 queries in some list serializers** (e.g. counts per contact). Annotate
   counts in the queryset.
4. **Six legacy check scripts** in `backend/scripts/manual_checks/` still need
   porting to pytest (depreciation, payment allocation, per-role dashboards).
5. **Frontend test coverage is a starter set** (Vitest; `npm test`).
