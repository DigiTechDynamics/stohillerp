# ERP Gap Analysis: Stohill vs D365 F&O, Business Central, Odoo, Sage Evolution

_Assessed and closed 2026-09-30 on branch `chore/production-hardening`._

## Verdict

Stohill is a **vertical real-estate ERP** (property, CRM, sales, leasing,
commissions, trust accounting) on a double-entry core with maker/checker
controls. After four gap-closure passes it covers the finance,
purchasing and property-management scope that BC, Odoo or Sage Evolution
would cover for a single-company agency, landlord or developer, and adds a
tenant portal with online payment. Two gaps remain, both needing decisions
or credentials from outside the codebase: multi-company and ZIMRA
fiscalisation (see the end of this document).

The review found three kinds of gap, and closed them in order:

1. **Control failures.** Module access and SoD were enforced only in the
   sidebar, any user could make themselves Super Admin, and KYC files were
   public.
2. **Integration breaks.** Sub-ledgers silently failed to reach the GL, or
   reached it wrongly: deposits, commissions, payroll, late fees, VAT rent,
   reversals, year-end, and AP payments that never settled invoices.
3. **Missing standard features.** Settlement, credit notes, FX, dimensions,
   budgets, cash flow, recurring journals, approvals, owner trust accounting,
   lease charges, and more.

Every fix and feature has a regression test in `backend/tests/test_gap_closure.py`,
`test_gap_closure_2.py`, `test_gap_closure_3.py`, `test_banking.py`,
`test_procurement_projects.py` and `test_portal.py`. The suite has 444 backend
tests and 11 frontend tests (Vitest).

---

## Capability matrix

Legend: ✅ present · 🟡 partial · ❌ missing · **→** changed in the gap-closure passes

| Area | Stohill | Business Central | D365 F&O | Odoo | Sage Evolution |
|---|---|---|---|---|---|
| **General ledger** — CoA, journals, immutability | ✅ | ✅ | ✅ | ✅ | ✅ |
| Starter CoA / tax codes / fiscal year on a clean install | ❌ **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| Maker/checker journal approval | ✅ | ✅ | ✅ | 🟡 | 🟡 |
| Year-end close to retained earnings | ❌ flags only **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| Dimensions (cost centres) | ❌ model unused **→ ✅** on lines, required per account, filterable in reports | ✅ | ✅ | ✅ | 🟡 |
| Budgets, budget vs actual | ❌ **→ ✅** API, report, entry screen | ✅ | ✅ | ✅ | ✅ |
| Recurring and auto-reversing journals | ❌ **→ ✅** | ✅ | ✅ | ✅ | 🟡 |
| Multi-currency posting in document currency | ❌ posted at 1:1 **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| Realised / unrealised FX (revaluation) | ❌ **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| Multi-company, intercompany, consolidation | ❌ | ✅ | ✅ | ✅ | 🟡 |
| **Reports** — TB, P&L, balance sheet | ✅ (reversals mis-stated **→ fixed**) | ✅ | ✅ | ✅ | ✅ |
| GL detail, AR/AP aging, cash-flow statement | ❌ **→ ✅** (with CSV) | ✅ | ✅ | ✅ | ✅ |
| Customer / supplier statements (PDF, email) | ❌ **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| **AR/AP settlement** — apply to chosen invoices | ❌ FIFO only (AP never settled) **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| Credit notes, unapplied cash, refunds, write-offs | ❌ **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| Approval workflows (thresholds, roles, sequence) | ❌ **→ ✅** AP invoices, payments, purchase orders | ✅ | ✅ | 🟡 | 🟡 |
| Purchase orders / 3-way match | ❌ **→ ✅** with price tolerance and audited override | ✅ | ✅ | ✅ | ✅ |
| Project accounting, WIP capitalisation | ❌ **→ ✅** development projects | ✅ | ✅ | ✅ | 🟡 |
| **Bank** — statement import, rules, auto-match | 🟡 two parallel models, stubbed matching **→ ✅** one model, real reconciliation | ✅ | ✅ | ✅ | ✅ |
| **Tax** — VAT codes, VAT return incl. credit notes | 🟡 **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| ZIMRA fiscalised tax invoices (FDMS) | ❌ | partner | partner | partner | ✅ |
| **Fixed assets** — books, depreciation, disposal | ✅ (tax book double-posted **→ fixed**) | ✅ | ✅ | ✅ | ✅ |
| **Payroll (ZW)** — PAYE, AIDS levy, NSSA | ✅ | partner | partner | 🟡 | ✅ |
| Payroll to GL, employer NSSA and ZIMDEF, approval | ❌ **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| Statutory summary, bank file, emailed payslips | ❌ **→ ✅** | partner | partner | 🟡 | ✅ |
| **Security** — server-side RBAC and SoD, private KYC files | ❌ **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| Validated CSV import (all-or-nothing, row errors) | ❌ raw inserts **→ ✅** | ✅ | ✅ | ✅ | ✅ |
| Scheduled jobs | ❌ **→ ✅** scheduler service | ✅ | ✅ | ✅ | ✅ |
| **Property / leasing** (compare Yardi, MRI, D365 real-estate ISVs) | | | | | |
| Recurring rent billing, escalation, proration | ❌ **→ ✅** | ISV | ISV | 🟡 | ❌ |
| Lease charges (service charge, utilities, parking) | ❌ **→ ✅** | ISV | ISV | ❌ | ❌ |
| Renewals, terminations with credit notes | ❌ **→ ✅** | ISV | ISV | ❌ | ❌ |
| Deposits held in trust, applied or refunded | ❌ **→ ✅** | ISV | ISV | ❌ | ❌ |
| Owner trust accounting, fees, statements, payouts | ❌ **→ ✅** | ISV | ISV | ❌ | ❌ |
| Maintenance to contractor bill and tenant recharge | ❌ **→ ✅** | ISV | ISV | 🟡 | ❌ |
| Brokered (agency) vs principal sales | ❌ **→ ✅** | ISV | ISV | ❌ | ❌ |
| Tenant self-service portal, online payments | ❌ **→ ✅** Paynow | ISV | ISV | ✅ portal | ❌ |

---

## What changed

### Pass 1: controls and ledger integrity
- **Privilege escalation.** `PATCH /core/me/` role changes, resetting other users'
  passwords, and editing roles or SoD rules all required only a login. Fixed.
- **Module access and critical SoD enforced by the API** (`utils/permissions.py`)
  on every endpoint.
- **Reversals** are no longer dropped from reports (`LEDGER_STATUSES`).
- **Year-end close** now posts a closing entry to retained earnings, and reopening
  reverses it.
- **Rentals.**
  - VAT and late-fee invoices were unbalanced and silently never posted.
  - Payments were applied twice.
  - Late fees never reached the GL.
  - Deposits never posted.
- **Commissions** accrue on approval.
- **Payroll** accrues one balanced entry per run.
- **Clean installs** get a chart of accounts, journals, posting profile, VAT
  codes and a fiscal year.
- **New:** rent billing with escalation; AR/AP aging, GL detail and budget vs
  actual reports.

### Pass 2: P0 hardening, settlement, FX, GL features
- **Private uploads.** KYC documents, contracts, CRM attachments and inspection
  reports are served only through authenticated download actions. In
  production this uses nginx `X-Accel-Redirect`, and the public `/media/` path
  refuses those folders. Confidential documents are hidden from other modules.
- **Lookup trimming.** ID and passport numbers, income and bank details are
  removed from contact and employee responses for modules that only need
  lookups.
- **Atomic, loud syncs.** Rental `save()` hooks no longer swallow AR/GL
  failures: the save and its posting are atomic and errors return a 400.
  `ATOMIC_REQUESTS` is on.
- **CSV import** validates every row through the module's serializer and is
  all-or-nothing with row-numbered errors. Existing keys are skipped. The
  broken `customers`/`statements` options were fixed.
- **Memo depreciation books.** Tax/memo asset books no longer post a second
  depreciation to the GL. Disposal uses the posting book instead of a
  hardcoded "Statutory".
- **Scheduling.** `run_daily_jobs` (billing → overdue → depreciation →
  recurring/reversing journals) and a `scheduler` service in Compose.
- **Settlement.**
  - Receipts and payments are applied to chosen invoices, or oldest-first.
  - Unapplied cash is tracked and can be applied later or refunded.
  - Credit notes (AR and AP) post reversed, reduce the VAT return, and apply
    to invoices.
  - Write-offs go to bad debts (AR) or other income (AP).
  - Every application is recorded in the `ar-allocations`/`ap-allocations`
    history.
  - AP payments now actually settle invoices. Legacy posted payments were
    reopened as unapplied so they can be allocated.
- **Currency.**
  - Invoices, receipts and payments post in their own currency at the dated
    rate. They were previously posted 1:1.
  - Settlement posts realised exchange differences.
  - `fx/revalue/` posts unrealised differences on open items, reversing the
    next day.
- **Dimensions.** Cost centre (and property) on journal, invoice and recurring
  lines, with a per-account "requires cost centre" rule. Filterable on TB,
  P&L and GL detail. Cost centres now have an API.
- **Recurring journals** with catch-up, draft or auto-post modes, and
  next-period reversal.
- **New reports:** cash-flow statement (indirect method, which checks itself
  against bank movement), and customer and supplier statements (JSON, PDF,
  email).
- **Pre-existing bugs fixed along the way:**
  - Invoice email and PDF import a `PDFService` that didn't exist.
  - `CustomerProfile.email` was missing.
  - The Documents page download button did nothing.
  - Manual journals used VAT Payable as the staff control account.
  - Foreign manual journals ignored the stored rate.

### Pass 3: property management, approvals, payroll
- **Owner trust accounting** for managed properties.
  - Rent is credited to 2210 Owner Funds Held, less the management fee (4300).
  - Repairs can be charged to the owner.
  - Owner statements, and payouts from the trust account limited to rent
    actually collected. Only finance can pay out.
- **Brokered sales** book only the commission, invoiced to the seller, with no
  cost of sale. Agent commission uses the default commission structure's split
  (it was hardcoded at 100%). Sales without an agent no longer crash.
- **Leases.**
  - Recurring charges (service charge, utilities, parking; optional VAT) are
    billed with rent.
  - The final partial month is prorated.
  - Renewal creates a follow-on lease, carrying charges and the deposit.
  - Termination credits unused billed periods via AR credit notes.
  - Rent reminders now fire. They targeted draft invoices, so they never ran.
  - The late-fee rate and grace period are settings.
- **Maintenance completion** raises the contractor's AP bill. It is charged to
  the owner on managed property, or recharged to the tenant through AR.
- **AP approval workflows.**
  - Rules by document type, base-currency threshold and role, applied in
    sequence.
  - The creator can't approve their own document, and a rejection blocks
    posting until re-approved.
  - Posting is refused until the document is approved.
- **Payroll.**
  - Employer NSSA and ZIMDEF are calculated and accrued.
  - The run approval step is maker/checker.
  - Statutory summary (PAYE + AIDS levy for P2, NSSA for P4, ZIMDEF).
  - Bank payment CSV.
  - Emailed payslips. The payslip PDF itself was broken: it referenced a
    removed field.
- **Frontend.**
  - The Reports page gained AR/AP aging, GL detail, budget vs actual with a
    budget editor, and cash flow.
  - Authenticated file downloads.
  - Vitest and Testing Library, run in CI.

### Pass 4: open items (bank, purchasing, projects, portal, screens)
- **One bank module.**
  - `finance.BankAccount` is the only bank account model. Migrations moved the
    corporate accounts and the legacy statement lines into it, and removed
    `CorporateBankAccount`, `BankTransaction` and `BankReconciliation`.
  - Statements import from CSV (single amount or debit/credit columns, ISO or
    DD/MM/YYYY dates, duplicates skipped).
  - Lines match to real unreconciled ledger lines. Each ledger line can match
    only one statement line (database constraint).
  - Rules auto-match or auto-post (keyword or regex).
  - Differences post as adjustments, and there is a reconciliation report.
  - The previous matching was a stub: manual match did nothing and the
    dashboard figures were fixed.
- **Purchasing** (`procurement/`).
  - Purchase orders, with approval rules of type `purchase_order`.
  - Goods received notes, and supplier invoices created from receipts.
  - Posting a PO-linked invoice enforces a 3-way match: quantity invoiced
    against received, and price within `PO_PRICE_TOLERANCE_PCT` (default 2%).
  - A match exception can be overridden, with a reason, only by someone other
    than the invoice's creator.
- **Development projects** (`projects/`).
  - Each project gets its own cost centre. Costs build up in 1540 Development
    Work in Progress, and open POs show as commitments.
  - The cost report shows budget, cost to date by account, and commitments.
  - Capitalisation moves WIP into property inventory (raising the property's
    cost) or into a new fixed asset with a statutory book.
- **Tenant portal** (`portal/`, SPA at `/portal`).
  - Tenants get their own role and log in with the portal module only. They
    can reach nothing but `portal/`, their own profile, and their own data.
  - Staff invite a tenant from the CRM contact. The activation link goes only
    to the tenant's email.
  - Tenants see their leases, invoices (PDF), statement and maintenance
    requests.
  - Online payment runs through Paynow (SHA512-hashed, verified callbacks, and
    polling on return). Receipting is idempotent: rent is paid through the
    rental payment flow, other invoices through a customer receipt and
    allocation.
  - A test gateway exists for development and is forced off in production.
- **Screens for the API-only features.**
  - Settlement: allocation, credit notes, write-offs, refunds and allocation
    history on AR/AP invoices, receipts and payments.
  - AP: approval panels, 3-way match status with override, and a document-type
    selector for credit notes.
  - AR/AP pages show real aging totals (they were hardcoded), and invoice and
    statement PDFs come from the server (the invoice PDF was a fake data URL).
  - Leases: billing, deposits, charges, renewal and termination. The fake
    7.5% commission panel was removed.
  - Rentals: maintenance completion, plus an Owners tab with trust balances,
    statements and payouts.
  - Payroll: approval now goes through the maker/checker endpoint (it
    previously patched the status directly). The run shows the statutory
    summary, bank file and payslip email.
  - A Finance Settings page for cost centres, recurring journals, approval
    rules and FX revaluation.
  - Purchasing and Development Projects pages, and the tenant portal.

---

## Review before go-live

- **Statutory rates are data, not code.** Confirm them against current ZIMRA
  and NSSA notices: PAYE brackets, AIDS levy 3%, NSSA 4.5% each side and its
  ceiling, ZIMDEF 1%. They are editable under payroll settings.
- **Late fee.** 10% of rent after 7 days (`RENT_LATE_FEE_RATE`,
  `RENT_LATE_FEE_GRACE_DAYS`). Check this against your lease terms.
- **VAT on brokered commission** is not charged. Add a tax code on the
  commission line if you are VAT-registered for agency services.
- **Legacy AP payments** were reopened as unapplied by migration
  `finance.0016`. Allocate them to the invoices they paid. Until then they
  appear as supplier credits in AP aging.
- **Access policy.** Review the table in `utils/permissions.py`. In
  particular, agents can read leases (through Properties), and CSV
  import/export is admin-only.
- **Online payments.** Set `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`,
  `PORTAL_BASE_URL` (the public URL tenants use) and
  `ONLINE_PAYMENTS_BANK_ACCOUNT` (the bank account code receipts land in).
  Paynow must be able to reach `/api/v1/payments/paynow/result/`. Make a
  small live payment and check the receipt before inviting tenants.
- **Bank merge.** After migrating, check that each bank account shows the
  expected GL account and that old statements appear under it.
- **Purchase-order tolerance.** `PO_PRICE_TOLERANCE_PCT` is 2% by default.

## Remaining gaps

Items 1–3, 6 and 7 of the previous list (screens, one bank module,
purchasing, project accounting, tenant portal) were closed in pass 4. Two
remain:

1. **ZIMRA fiscalisation (FDMS).** This needs ZIMRA device/API accreditation and
   credentials, so it can't be built or tested here. When you have them, add a
   fiscalisation step to invoice posting and store the fiscal signature and QR
   on `CustomerInvoice`.
2. **Multi-company, intercompany and consolidation.** This is an architectural
   change: a company on every ledger record, and per-company sequences and
   periods.
