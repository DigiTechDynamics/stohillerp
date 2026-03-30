# Stohill Properties — Property Management System

A production-grade, full-stack Enterprise Resource Planning (ERP) system for real estate companies. Built with Django 5 + React 18.

---

## 🏗️ Architecture Overview

```
stohill-erp/
├── backend/                    # Django 5 REST API
│   ├── config/                 # Django settings, URLs, WSGI
│   ├── apps/
│   │   ├── core/               # Users, RBAC, Audit Logs
│   │   ├── properties/         # Property Operations
│   │   ├── crm/                # CRM Pipeline + Kanban
│   │   ├── sales/              # Sale Transactions
│   │   ├── rentals/            # Lease Management
│   │   ├── finance/            # Double-Entry Accounting
│   │   │   └── services/       # AccountingService (posting layer)
│   │   ├── commissions/        # Commission Management
│   │   ├── documents/          # Document & Compliance
│   │   ├── hr/                 # HR & Agent Management
│   │   └── dashboard/          # Executive Dashboard API
│   └── utils/                  # Middleware, Pagination, Exceptions
└── frontend/                   # React 18 + TypeScript + Vite
    └── src/
        ├── components/
        │   ├── layout/         # AppLayout, Sidebar
        │   └── common/         # CommandPalette, SidePanels
        ├── pages/              # One page per module
        ├── services/           # Axios API client
        ├── stores/             # Zustand auth + UI state
        ├── types/              # TypeScript definitions
        └── utils/              # Formatting utilities
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+

---

### Backend Setup

```bash
cd backend

# 1. Create virtual environment
python -m venv venv
source venv/bin/activate          # Linux/macOS
# venv\Scripts\activate           # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE stohill_erp;"

# 4. Configure environment (optional — defaults work for dev)
export DB_NAME=stohill_erp
export DB_USER=postgres
export DB_PASSWORD=postgres
export DB_HOST=localhost
export DJANGO_SECRET_KEY=your-secret-key-here

# 5. Run migrations
python manage.py makemigrations
python manage.py migrate

# 6. Seed demo data
python manage.py seed_stohill

# 7. Start development server
python manage.py runserver 8000
```

**Demo Credentials (created by seed command):**
| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@stohill.co.za | admin123! |
| CEO/Executive | ceo@stohill.co.za | exec123! |

---

### Frontend Setup

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Start development server (proxies /api to Django)
npm run dev
```

Open: **http://localhost:5173**

---

## 🏛️ Module Documentation

### 1. Property Operations
- Full property CRUD with image management
- Grid, List, and Map view modes
- Status tracking: Available → Listed → Under Contract → Sold/Occupied
- Valuation history and inspection scheduling

### 2. CRM Pipeline with Kanban
- Contact management (Buyers, Sellers, Tenants, Investors)
- Visual Kanban board with drag-friendly stage management
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

**Account Structure (South African CoA):**
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

---

## 🛠️ Production Deployment

```bash
# Backend
export DEBUG=False
export DJANGO_SECRET_KEY=<strong-random-key>
export ALLOWED_HOSTS=yourdomain.com
export DB_PASSWORD=<strong-password>
export CORS_ALLOWED_ORIGINS=https://yourdomain.com

python manage.py collectstatic
gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4

# Frontend
npm run build
# Serve dist/ with nginx
```

---

## 📋 Development Notes

- **Python path:** All imports use `apps.module_name` (not relative)
- **UUID keys:** All models use UUID primary keys for security
- **Transactions:** Finance operations wrapped in `@transaction.atomic`
- **Immutability:** Posted journal entries raise `ValidationError` on save attempt
- **SA Tax Year:** Fiscal year runs March 1 – February 28 (South Africa)
- **VAT:** 15% South African VAT applied to commercial leases and commissions

---

*Stohill Properties — Built for South African real estate professionals*
