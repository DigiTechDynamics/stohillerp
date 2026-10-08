# Changelog

## [Unreleased] - Module settings and invoicing fixes

Branch `fix/module-settings`. Tests are in `backend/tests/test_module_settings.py`
and `CrudTable.test.jsx`.

### Upgrade notes
- Run `migrate`: it adds the starter property types (Residential, Sectional
  Title, Commercial, Industrial, Agricultural, Vacant Land, Mixed Use) to
  installs that have none. `bootstrap_system` seeds them too.

### Fixed
- **Sales invoices could not be saved.** "Save & Post Invoice" reloaded the
  page, so nothing reached the server and any error disappeared. The invoice
  currency now also defaults to the base currency, on supplier invoices too.
- **Currency picker** could come up empty after opening the chart of accounts
  or a journal entry, because screens stored the currency list in different
  shapes under the same cache key. All of them now share one `useCurrencies` hook.
- **Utility tariffs failed to save** when the flat rate (or another number) was
  left blank, e.g. for a stepped tariff ("rate: This field may not be null").
  Editable tables now leave a blank number out so the server default applies;
  fields that may genuinely be empty are marked `nullable`. This also fixes the
  same error on document types, meters, recovery schedules, lease options and
  maintenance plans.
- **Property types could not be added**: there was no screen for them, and a
  new install had none, so no property could be created.
- **New pipeline stages failed to save** (the stage's pipeline was dropped by
  the API), which also broke creating a pipeline from the CRM board.
- The rental invoice form explains that only active leases can be invoiced
  when there are none.

### Added: a settings page per module
Each module page has a **Settings** button. The open tab is kept in the URL,
e.g. `/properties/settings?tab=types`.
- **Property & rental** (`/properties/settings`): new Property types tab, plus
  the existing tariffs, CPI, arrears stages, custom fields, portfolios and
  defaults.
- **CRM** (`/crm/settings`): pipelines, stages, lost reasons (including retired
  ones), tags, email templates and sales teams.
- **HR** (`/hr/settings`): departments and job positions.
- **Documents** (`/documents/settings`): document types and compliance
  requirements (new API; only the Documents module can change them, and a
  requirement with records cannot be deleted).
- **Fixed assets** (`/finance/assets/settings`): asset categories with their
  four GL accounts.
- **Finance** (`/finance/settings`): adds Currencies and a link to tax codes.

## UAT findings

Branch `fix/uat-findings`. Fixes the findings in `uat-findings.md`. Tests are in
`backend/tests/test_uat_findings.py`, `test_notifications_inbox.py`,
`test_audit_log.py` and the new frontend `*.test.jsx` files.

### Upgrade notes
- Run `migrate` and `bootstrap_system`. They seed document types, fixed asset
  categories and accounts 1550 and 4970, and point existing posting profiles at
  the property-management accounts the code used before.
- Email now goes out by SMTP as soon as `EMAIL_HOST` is set. The compose file
  used to force the console backend, so no email was ever delivered.
- New settings: `SMS_BACKEND` (Twilio or a JSON HTTP gateway), `SMS_FROM`,
  `SMS_TWILIO_*`, `SMS_HTTP_*`, `RENTAL_PAYMENTS_BANK_ACCOUNT`,
  `DEFAULT_RENT_ESCALATION_RATE`, `DEFAULT_MANAGEMENT_FEE_RATE`, and optionally
  `VITE_MAP_TILE_URL` / `VITE_MAP_ATTRIBUTION` for a commercial map provider.
- Payroll refuses to process when a statutory setting or the PAYE brackets for
  the run's currency are missing, instead of using built-in rates.

### Fixed (user-reported)
- **Notifications** (#1, GAP-1, HC-3): a per-user inbox under the bell with an
  unread count, mark read and mark all read. Raised by journal batches and AP
  approvals, leave requests and decisions, tenant maintenance requests,
  contractor and owner actions, online payments, lease alerts and CRM
  assignments.
- **Logo** (#2): the Stohill logo replaces the "S" placeholder.
- **Side panel** (#3): record panels with two columns open wider and no longer
  overflow; light mode uses a white sheet with grey cards and clearer text.
- **Dialogs** (#4, GAP-22): every browser alert, confirm and prompt is replaced
  by the application's own dialog.
- **Light mode** (#5): grey text that was only readable on hover is now dark,
  and row edit/delete buttons are always visible.
- **Map** (#6): properties are shown on OpenStreetMap, which needs no key.
  The property form has a location picker and address lookup.
- **Pagination** (#7): page-size selector and an always-visible
  "Showing x-y of n" footer.
- **Rental invoices** (#8, GAP-2): a detail panel with the charges, payments
  and a PDF preview, download and print; the list exports to Excel or PDF.
- **Documents** (#9-#11, HC-1, HC-2, GAP-3): upload works (reference, size and
  type are filled in). Document type tiles come from the system with live
  counts and filter the list. A detail panel previews and downloads the file,
  and document types can be set up.
- **Exports** (#12): Excel produces a real .xlsx and PDF a formatted PDF.
- **AR invoices and receipts** (#13, #14): PDFs escape names and descriptions
  (an "&" made generation fail); receipts can be downloaded as PDF; detail
  panels always load the full record.
- **Fixed assets** (#15): the depreciation book is saved with the asset,
  errors are shown, and starter categories are seeded.

### Fixed (hardcoded data)
- The top bar shows the real name and role (HC-4, HC-5). The login year is
  current (HC-6). Phone placeholders and the property country follow the
  company's country (HC-7, HC-13).
- The unused rental posting with 15% VAT is removed (HC-8).
- Owner funds, management fees, recoveries, maintenance and withholding tax
  accounts come from the posting profile (HC-9).
- Rental payments record the bank account they were banked into, with a
  configurable default. Payments are no longer banked to the first account (HC-10).
- Postings and payroll use the base currency instead of USD (HC-11).
- Missing payroll settings are reported, not replaced by built-in rates
  (HC-12).
- Escalation and management fee defaults are set under Property settings >
  Defaults (HC-14).

### Added (gaps)
- Audit log: changes made through the API, sign-ins and sign-outs are
  recorded and shown under User Access > Audit Log (GAP-4).
- CRM: the contact's KYC vault works (GAP-5). Sales teams have a screen
  (GAP-6). Notes can carry attachments, which can be downloaded (GAP-7).
- Fixed assets: books and location history on the asset (GAP-8), and an
  asset history view (GAP-17).
- HR: attendance with worked hours (GAP-9), and leave allocations with taken
  and remaining days (GAP-10).
- Executive mode is saved on the user and switched from the user menu
  (GAP-11).
- Journal entries can be reversed from the entry (GAP-12).
- Payroll: statutory rates are saved and PAYE brackets can be managed per
  currency (GAP-13).
- Opportunities can be deleted from the table (GAP-14).
- SoD: "Auto-Suggest Rules" offers the standard conflicting module pairs
  (GAP-15).
- Filters work in Banking, bank transactions and the CRM calendar (GAP-16).
- User Access > Integrations shows email, SMS and Paynow status, with test
  sends, and lists the processes that are manual by design. Startup checks
  warn about missing configuration (GAP-18 to GAP-21).

### Open
- GAP-23 (MRI MDA comparison): `gaps.md` is not in the repository, so the
  seven features still need to be reviewed and planned.
- Paynow keys, an SMTP server and an SMS gateway account must be supplied
  for GAP-18 to GAP-20 to take effect.

## [Unreleased] - technical debt

Branch `fix/technical-debt`.

- **Tokens out of `localStorage`.**
  - Login now sets the refresh token as an httpOnly, SameSite=Strict cookie
    (`stohill_refresh`, scoped to `/api/v1/auth/`), and the body carries only
    the access token.
  - The SPA keeps the access token in memory. After a reload, the first 401
    refreshes it from the cookie.
  - Refreshing from the cookie needs `X-Requested-With: XMLHttpRequest`.
  - Logout revokes the token and clears the cookie.
  - Tokens stored by older versions are discarded on upgrade, so users sign
    in once more.
  - New setting `JWT_COOKIE_SECURE`.
- **No per-row queries in list endpoints.** Fixed:
  - Users and roles: role modules are prefetched and the SoD rules are loaded
    once per response.
  - Contacts: opportunity and document counts and active leases.
  - Opportunities: next activity and pipeline stages.
  - Customer and supplier balances.
  - Accounts, tax codes, employees, tax brackets and properties.
  - Record lock checks for roles, accounts, fiscal periods and years, assets
    and bank statements now run as one subquery per list.
  - `tests/test_query_counts.py` fails if any list endpoint's query count
    grows with the number of rows.
- **Legacy manual checks ported.** The `scripts/manual_checks/` scripts are
  now assertions in `tests/test_legacy_checks.py`, and the scripts are
  removed. The tests cover:
  - Depreciation.
  - Disposal at a gain or a loss.
  - Oldest-first receipt allocation.
  - Commissions paid through payroll.
  - The dashboards for every role.

## [Unreleased] - property-management gaps

Branch `feat/property-management-gaps`. Closes the partial and missing items
from the comparison with MRI MDA Property Manager (sectional title is out of
scope for now). Tests are in `backend/tests/test_property_management.py` and
the new frontend `*.test.jsx` files.

### Properties
- **Property workspace** (`/properties/:id`): tabs for overview, units,
  photos, valuations, inspections, owners, meters, recoveries and planned
  maintenance. Open it from the property side panel.
- **Units**: unit type, gross lettable area (GLA) and market rent. A unit's
  occupancy follows its active lease.
- **Photos**: upload photos and pick the cover photo.
- **Valuations**: valuation history. The latest valuation becomes the
  current value.
- **Inspections**:
  - Ingoing, outgoing and routine inspections with a standard checklist.
  - Per-item condition, photo and repair cost.
  - A PDF report.
  - An outgoing inspection can be compared with the ingoing one.
  - Repair costs are kept from the deposit when it is released.
- **Co-ownership**: owner shares per property. Owner funds, statements and
  payouts are split by share.
- **Portfolios and custom fields**: user-defined fields for properties,
  units, leases and contacts.
- **Agency fees**: letting and procurement fees are charged to the owner.

### Leases
- Escalation can be fixed, stepped (a schedule) or CPI-linked with a margin.
  CPI values are entered under Property settings.
- Options and break clauses, with deadline alerts.
- Guarantees and sureties.
- Turnover rent for retail leases.
- E-signature workflow: send for signature, mark signed.
- Debit-order mandates.

### Operations
- **Utilities**:
  - Flat or stepped tariffs.
  - Unit and bulk meters, with readings recharged on the next rent invoice.
  - Bulk-meter loss reconciliation.
- **Recoveries**:
  - Operating costs, rates and insurance, apportioned by area, a fixed % or
    equally.
  - Billed monthly on account.
  - Reconciled at year end, with invoices or credit notes for the
    difference.
- **Arrears**:
  - Configurable stages: reminder, letter of demand, final demand, legal.
  - A case per lease with a history.
  - Promises to pay and hand-over to attorneys.
  - Runs daily or on demand.
- **Collections**:
  - Debit-order batches with a bank file and paid/unpaid results. Paid items
    are receipted.
  - Monthly deposit interest.
- **Owner payment runs**: pay every owner's available balance in one run and
  download a bulk-payment bank file.
- **Lettings**: tenant applications with a credit check, rent-to-income
  ratio, approval and conversion to a draft lease.
- **Maintenance**:
  - Contractor quotes. Accepting a quote raises a purchase order.
  - Quotes above `MAINTENANCE_OWNER_APPROVAL_LIMIT` wait for the owner's
    approval.
  - Planned and preventive jobs are raised automatically.
- **Reports**:
  - Rent roll, lease expiry, vacancy, aged arrears and income per property,
    each exportable as CSV.
  - Saved reports, e-mailed weekly or monthly.
- **Messages**:
  - Bulk e-mail and SMS to tenants or owners.
  - E-mailing of invoices and statements.
  - A message log.
  - SMS is pluggable (`SMS_BACKEND`) and is only logged until a provider is
    configured.

### Portals
- **Owner portal** (`/owner`): balances, properties (owner's share),
  statement with PDF, maintenance, and quote approvals.
- **Contractor portal** (`/contractor`): assigned jobs (status, notes,
  report done), open jobs to quote for, and the contractor's quotes.
- **Invitations**: invite owners from the contact panel and contractors from
  the supplier panel. Logins go to their own portal, and a person with
  several roles can switch between portals.

### Integrations
- Credit bureau, e-signature and the CPI feed run through hooks in
  `apps/propman/integrations.py`:
  - `CREDIT_BUREAU_BACKEND`
  - `SIGNATURE_BACKEND`
  - `CPI_FEED_BACKEND`
- Each hook defaults to manual entry until a provider adapter is written.

### Settings
- New environment variables, in `.env.example` and docker-compose:
  - `SMS_BACKEND`
  - `DEPOSIT_INTEREST_RATE`
  - `LEASE_EXPIRY_ALERT_DAYS`
  - `MAINTENANCE_OWNER_APPROVAL_LIMIT`
  - `EMAIL_INVOICES_ON_BILLING`
- A new page, **Property Settings**, manages tariffs, CPI, arrears stages,
  custom fields and portfolios.

## production-hardening

Branch `chore/production-hardening`. Every bug below has a regression test in
`backend/tests/`.

### Edit and delete where applicable

- **Ledger protection (server side).** Posted records could be edited or
  deleted through the API. A posted journal entry was deleted outright (204)
  in testing, and an active lease was edited and deleted.
  `utils/record_rules.py` now enforces the rules on every update and delete:
  - Transactions (invoices, receipts, payments, journal entries and batches,
    purchase orders, rental invoices, payroll runs and payslips, sales,
    commissions, leases, maintenance jobs, leave requests) can be changed only
    while they are drafts or open.
  - Posted ones are corrected by reversal, credit note, refund or
    cancellation.
  - Assets with depreciation history, reconciled bank lines, system accounts
    and accounts with postings, the base currency, and roles in use are
    protected. Users are deactivated, not deleted.
- **Clear reasons.** Every record the API returns carries `edit_lock` and
  `delete_lock` (null, or the reason). Deleting a record that others still
  use returns "cannot be deleted because it is used by 3 journal lines..."
  instead of a server error.
- **Screens.**
  - A shared `RecordActions` control (edit, and delete with confirmation),
    added across properties, rentals (properties, tenants, leases, invoices,
    maintenance), sales, commissions, CRM activities and notes, HR
    (employees, agents, departments, leave), payroll runs, the chart of
    accounts, journal batches, AR and AP (customers, suppliers, invoices,
    receipts, payments), fixed assets, currencies and exchange rates, fiscal
    years, Finance Settings, bank accounts and statements, purchase orders,
    projects, documents, users, roles and SoD rules.
  - Locked actions are shown disabled, with the reason as a tooltip.
  - New edit modes: maintenance tickets, CRM activities, draft purchase
    orders, projects, cost centres, approval rules, recurring journals.
- **Fixed along the way:**
  - Several list rows had a "⋮" button that did nothing.
  - The chart of accounts showed every account as Active.
  - The AP lists showed fixed "AP Control Account" and "Default Bank" text.
  - A draft journal batch couldn't be deleted because its own entries blocked
    it.

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
