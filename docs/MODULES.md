# Module & API Reference

> Moved from the original README. Setup and deployment now live in the root README.
> Currency/VAT examples below may reference South Africa; the live defaults are
> Zimbabwe/USD (see `COMPANY_*` settings).

## Modules

### 1. Property Operations
- Full property CRUD with image management
- Grid, List, and Map view modes
- Status tracking: Available → Listed → Under Contract → Sold/Occupied
- Valuation history and inspection scheduling

### 2. CRM Pipeline with Kanban
- Contact management (Buyers, Sellers, Tenants, Investors)
- Visual Kanban board with drag-friendly stage management and **SLA Tracking** for stale deals
- Inbound Lead API (Web-to-Lead ingestion) for property portal integrations
- KYC & Document Vault with a structured verification workflow
- Visual Team Calendar for scheduling viewings, meetings, and follow-ups
- Territory and Sales Team management
- Activity log: calls, emails, viewings, tasks
- Lead rating (Hot/Warm/Cold) and source tracking

### 3. Sales & Brokerage
- Sale transaction lifecycle: Offer → Bond → Transfer → Registration
- Suspensive condition tracking
- Attorney linkage (transferring + bond)
- Auto-posting to Finance on registration

### 4. Rental Management
- Full lease lifecycle with automatic invoice generation
- Monthly rental invoicing with VAT support
- Payment recording and reconciliation
- Maintenance request workflow
- Deposit tracking (trust account)

### 5. Finance & Accounting (Double-Entry)

**Key Design Principles:**
- Every transaction: `Σ Debits = Σ Credits` (enforced at service layer)
- Posted entries are **IMMUTABLE** — corrections via reversals only
- Fiscal period locking prevents backdating
- All module transactions auto-post via `AccountingService`

**Account Structure (Standard CoA):**
```
1xxx - Assets      (Bank, Receivables, Fixed Assets)
2xxx - Liabilities (Payables, VAT, Deposits, Bonds)
3xxx - Equity      (Share Capital, Retained Earnings)
4xxx - Revenue     (Rental, Commission, Sale Proceeds)
5xxx - Expenses    (Commission, Maintenance, Rates, Salaries)
```

**Journals:**
- `GJ` — General Journal (manual)
- `SJ` — Sales Journal (auto-posted)
- `RJ` — Rentals Journal (auto-posted)
- `CJ` — Commission Journal (auto-posted)
- `PJ` — Payroll Journal

**Reports Available:**
- Trial Balance (by period)
- Income Statement (by date range)
- Balance Sheet (as at date)

### 6. Commission Management
- Configurable commission structures per transaction type
- Multi-tier: Company rate → Agent split
- Approval workflow: Calculated → Pending → Approved → Paid
- Auto-posting to Finance on payment

### 7. Document & Compliance
- Centralised document store with versioning
- FICA, EAAB compliance tracking
- Expiry alerts and renewal reminders
- Linked to Properties, Contacts, Leases, Sales

### 8. HR & Agent Management
- Employee profiles with EAAB fidelity fund tracking
- Department structure with reporting lines
- Leave request and approval workflow
- Commission split configuration per agent

### 9. Executive Dashboard
- Real-time KPI aggregation across all modules
- Revenue trend charts (12-month area chart)
- Pipeline funnel by stage
- Top agent leaderboard
- Portfolio value and occupancy metrics
- Auto-refreshes every 60 seconds

---

## 🔐 Role-Based Access Control

| Role | Finance | Properties | CRM | HR | Commissions | Executive Dashboard |
|------|---------|------------|-----|----|-------------|---------------------|
| Super Admin | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ |
| Executive | 👁 View | 👁 View | 👁 View | 👁 View | 👁 View | ✅ |
| Finance Manager | ✅ Full | 👁 View | — | — | ✅ Approve | — |
| Sales Manager | — | ✅ Full | ✅ Full | — | ✅ Approve | — |
| Property Agent | — | 👁 View | ✅ Edit | — | — | — |
| HR Manager | — | — | — | ✅ Full | — | — |

---

## 🌐 API Reference

**Base URL:** `http://localhost:8000/api/v1/`

**Authentication:** JWT Bearer Token
```
Authorization: Bearer <access_token>
```

**Key Endpoints:**
```
POST   /auth/login/                     # Get JWT tokens
POST   /auth/refresh/                   # Refresh access token
GET    /core/me/                        # Current user profile

GET    /properties/                     # List properties
GET    /properties/map_data/            # Coordinates for map view
GET    /properties/stats/               # Portfolio statistics

GET    /crm/contacts/                   # List contacts
GET    /crm/opportunities/kanban/       # Kanban board data
POST   /crm/opportunities/{id}/move_stage/  # Move deal to stage

POST   /sales/transactions/{id}/post_to_finance/   # Post sale to GL

POST   /finance/entries/{id}/post_entry/   # Post journal entry
POST   /finance/entries/{id}/reverse/      # Create reversal
GET    /finance/reports/trial-balance/     # Trial Balance
GET    /finance/reports/income-statement/  # Income Statement
GET    /finance/reports/balance-sheet/     # Balance Sheet

POST   /commissions/records/{id}/approve/  # Approve commission

GET    /dashboard/executive/           # Full KPI dashboard
```
