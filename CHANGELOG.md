# Changelog

## [Unreleased] - production-hardening

Branch `chore/production-hardening`. Every bug below has a regression test in
`backend/tests/`.

### Real data instead of hardcoded values

- **Company details** come from `COMPANY_*` settings (`core/company/`).
  - Invoices, statements and payslips printed a made-up address and phone
    ("Harare, Zimbabwe | +263 77 000 0000 | info@stohill.co.zw") and a
    tagline. They now print the configured address, contact details and VAT
    number/TIN.
  - Invoice emails had the company name hardcoded (misspelled "Stohil").
- **Currency.** The UI uses the base currency from Finance > Currencies
  instead of `'USD'`, and records keep their own currency. Amounts now show
  cents: they were rounded to whole units. Serializers no longer claim USD
  for records without a currency. New bank accounts default to the base
  currency.
- **Sales page.** The four KPI cards were fixed figures ($12.5M, 24 deals,
  $4.2M, 8, with invented trends). They now come from
  `sales/transactions/stats/`: registered sales YTD in base currency with the
  change vs the same period last year, active deals, deals pending
  completion, and completions this month. Sales without an exchange rate are
  flagged, not silently summed.
- **Commissions page.** The cards were fixed ($2.1M, $450k, $62,500) and
  named an invented top earner ("Jane Smith"). They now come from
  `commissions/records/stats/`.
- **Compliance audit.** The panel always showed invented checks, an "81%"
  score and a made-up "32 units" recommendation, because
  `documents/compliance/` was swallowed by the document detail route. The
  route is fixed. A new `summary/` endpoint scores each requirement from the
  records, with expiry dates applied as of today.
- **Executive dashboard.**
  - The sales trend was a fixed "12.8%". It is now the year-to-date change
    vs last year, or none when there's no prior data (a missing baseline
    showed as +100%).
  - Revenue and expenses were all-time sums of both debits and credits. They
    are now year-to-date net figures.
  - The revenue chart nets credit notes. Sales are converted to the base
    currency.
  - Two cards opened panels that don't exist.
- **Other fixes.**
  - The Reports page property filter called a non-existent API.
  - Bank account ordering used a removed field.
  - The error screen claimed "our team has been notified".

### Production readiness: backups, monitoring, lint

- **Backups.** A `backup` Compose service takes a daily database dump, verifies
  it, keeps 14 days, and reports unhealthy if backups stop. A test restore
  was run.
- **Error monitoring.** Sentry integration, switched on by `SENTRY_DSN`. It
  captures unhandled errors and failed scheduled jobs, and sends no personal
  data.
- **Frontend lint.** ESLint 10 with the React hooks rules, run in CI with zero
  warnings allowed. It found real bugs, now fixed:
  - Three panels (property, employee, sale) called hooks after an early
    return. That crashes React when the record changes.
  - Saving a tenant, opening a department with a manager, and a posting
    profile with unmapped accounts each crashed on an undefined name.
  - VAT return failures showed a blank page.
  - The bank account form's error message was empty. This was introduced in
    the pass 4 edit.
  - Dead queries were removed, including a 1,000-account fetch on the journal
    entry page. 193 unused imports were removed.

### ERP gap closure, pass 4: open items

Tests are in `backend/tests/test_banking.py`, `test_procurement_projects.py`
and `test_portal.py`, plus the Vitest suite. The details are in
`docs/GAP_ANALYSIS.md`, under *Pass 4*.

- **Banking.**
  - One bank account model (`finance.BankAccount`). Migrations
    `finance.0018`–`0019` and `banking.0003`–`0005` merge the corporate accounts
    and move legacy statement lines.
  - CSV statement import, matching against real ledger lines, rule-based
    auto-match and auto-post, adjustments, and a reconciliation report.
  - The old manual match did nothing, and the dashboard figures were fixed
    values.
- **Purchasing** (new `procurement` app).
  - Purchase orders with approval rules, goods received notes, and supplier
    invoices created from receipts.
  - 3-way match enforced on posting, with a price tolerance and an override
    audited against a second user.
- **Development projects** (new `projects` app).
  - A cost centre per project, costs held in 1540 Work in Progress, and a
    cost report with PO commitments.
  - Capitalisation to property inventory or to a new fixed asset.
- **Tenant portal** (new `portal` app, SPA at `/portal`).
  - Tenant role fenced to the portal API. Staff send invitations from CRM, and
    the link goes to the tenant's email only.
  - Tenants see leases, invoices (PDF), their statement and maintenance
    requests.
  - Paynow online payment with hash-verified callbacks and idempotent
    receipting.
- **Screens for features that were API-only.**
  - Settlement, credit notes, write-offs and refunds.
  - AP approvals and 3-way match override.
  - Lease billing, deposits, charges, renewal and termination.
  - Maintenance completion, and an Owners tab (balances, statements, payouts).
  - Payroll statutory summary, bank file and payslip email.
  - Finance Settings (cost centres, recurring journals, approval rules, FX
    revaluation).
  - Purchasing and Projects pages.
  - Customer invoices gained a server-side PDF endpoint (`pdf/`).
- **Configuration.** SMTP settings (`EMAIL_HOST` and related) and the
  portal/Paynow variables are read from the environment and forwarded by
  Compose. Before this, emails could only go to the console.
- **Fixed along the way:**
  - The AR and AP pages showed hardcoded totals, and the AR invoice PDF button
    downloaded a fake text file.
  - The lease panel showed an invented 7.5% commission.
  - Payroll approval patched the run status directly, bypassing the
    maker/checker endpoint. The API also accepted that edit, so the run's
    status and totals are now read-only and move only through processing and
    approval.
  - A failed invoice email returned 200.

### ERP gap closure, passes 2-3

Tests are in `backend/tests/test_gap_closure_2.py` and `test_gap_closure_3.py`,
plus the frontend Vitest suite. The full list is in `docs/GAP_ANALYSIS.md`,
under *What changed*.

- **Security.**
  - Private uploads are served only by authenticated download actions (nginx
    `X-Accel-Redirect` in production).
  - Personal fields are trimmed for modules that only need lookups.
  - CSV import is validated and all-or-nothing.
- **Integrity.**
  - Sub-ledger syncs are atomic and raise instead of logging.
  - `ATOMIC_REQUESTS` is on.
  - Memo asset books no longer post depreciation.
  - Rent reminders now fire.
- **Finance.**
  - AR/AP settlement with allocation history, credit notes, refunds and
    write-offs. AP payments now settle invoices; migration `finance.0016`
    reopens legacy posted payments as unapplied.
  - Document-currency posting, realised FX, and revaluation that reverses the
    next day.
  - Cost-centre dimension.
  - Recurring and auto-reversing journals.
  - Cash-flow statement, and customer and supplier statements (PDF and email).
  - AP approval workflows.
- **Property.**
  - Owner trust accounting and payouts.
  - Brokered sales book only the commission.
  - Lease charges, proration, renewal and termination.
  - Maintenance completion raises the contractor's AP bill and an optional
    tenant recharge.
- **Payroll.**
  - Employer NSSA and ZIMDEF.
  - Maker/checker run approval.
  - Statutory summary, bank file, and emailed payslips.
- **Operations.** `run_daily_jobs` and a `scheduler` service in Compose.
- **Pre-existing bugs fixed along the way:**
  - Invoice email/PDF imported a missing `PDFService`.
  - Payslip PDF referenced a removed field.
  - `CustomerProfile.email` was missing.
  - Sales without an agent crashed; agent commission ignored the commission
    structure.
  - Manual journals posted staff lines to VAT Payable.

### ERP gap closure

See `docs/GAP_ANALYSIS.md` for the full analysis. Every item below has a test
in `backend/tests/test_gap_closure.py`.

- **Security.**
  - Users could grant themselves any role via `PATCH /core/me/`.
  - Any user could reset any other user's password, or edit roles, modules and
    SoD rules. These now need access admin.
  - Role/module access and critical SoD rules are now enforced by the API on
    every endpoint (`utils/permissions.py`), not just in the sidebar.
- **Reports mis-stated reversals.** The reversed original was dropped while
  its reversal counted. Reports now use `JournalEntry.LEDGER_STATUSES`.
- **Year-end close** now posts the closing entry to retained earnings, and
  reopening reverses it.
- **Rentals.**
  - VAT and late-fee invoices never posted (unbalanced).
  - Payments were allocated twice.
  - Late fees never reached AR/GL.
  - Deposits were never posted; added record/refund actions.
- **Commissions** accrue on approval. **Payroll** posts one balanced accrual
  per run with seeded GL mappings; AP clears net pay instead of booking wages
  twice.
- **Clean installs.** `bootstrap_system` now seeds the chart of accounts,
  journals, posting profile, VAT codes and the current fiscal year. A taxed
  line without a tax code no longer crashes.
- **Added.**
  - Recurring rent billing with annual escalation (`generate_rental_invoices`).
  - AR/AP aging, GL detail and budget vs actual reports, plus a budgets API.
  - All of them wired into the Reports page.
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
