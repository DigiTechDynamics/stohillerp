# Stohill ERP - Log of Changes

This document tracks the evolution of the Stohill ERP, documenting fixes, features, and architectural improvements organized by module and date.

## 🟢 Today: 2 April 2026

### [Document Management]
- **Full Module Restoration**: Resolved database out-of-sync issues and missing tables via the `0002` migration.
- **Dynamic Ingestion Engine**: Redesigned `DocumentUploadForm` to fetch workspaces and categories dynamically from the API.
- **Compliance Linkage**: Implemented automated compliance hooks that mark Contacts/Employees as `COMPLIANT` when KYC docs are uploaded.
- **Premium Inspector UI**: Launched `DocumentCard` and `DocumentInspector` for high-fidelity file previews and audit trail analysis.
- **Automated Metadata Extraction**: Verified MIME-type detection, file sizing, and unique reference generation (`DOC-XXXXXX`).
- **Seeding & Verification**: Created `seed_documents.py` and `verify_fix_upload.py` for reliable dataset initialization and pipeline testing.

### [Security & Hardening]
- **Advanced Middleware**: Deployed `utils/middleware.py` with strict Content Security Policy (CSP), XSS protection, and HSTS headers.
- **Identity Self-Service**: Launched "My Profile" dashboard, "Forgot Password", and "Reset Password" workflows with secure token validation.
- **RBAC Audit**: Executed `verify_hardening_advanced.py` to confirm RBAC integrity and IDOR protection across all critical endpoints.

### [Global Standards & Branding]
- **Design System**: Updated `index.css` with a comprehensive, theme-aware design system using Tailwind variables for perfect Light/Dark mode contrast.
- **Code Standards**: Introduced `utils/serializers.py` to standardize common serialization patterns across the backend.

---

## 🟡 Yesterday: 1 April 2026

### [Finance - Sage 200 Evolution Standards]
- **Batch Posting Engine**: Transitioned all financial entries to accountable `JournalBatch` workflows with Maker/Checker validation.
- **Automated Commission Accruals**: Integrated real-time G/L posting for agent commissions during sales deal registration.
- **Cost Center Profitability**: Added property-level filtering to Trial Balance and Income Statement reports.
- **Ledger Verification**: Verified financial synchronization and batch consistency via `seed_finance.py` and `test_batch_sync.py`.

### [Rental & Property Operations]
- **Fully-Automated Billing Cycle**: Developed `BillingService.py` and `process_rent_billing` management command for bulk monthly invoicing.
- **Annual Escalation Engine**: Implemented logic for automated rent increases based on lease anniversary dates.
- **Verification Suites**: Created `verify_rent_billing.py` and `verify_escalations.py` to ensure accurate ledger postings during automated runs.

### [CRM & Sales Workflow]
- **Kanban Deal Stability**: Resolved a critical UUID primary key collision bug in `Opportunity.save()`.
- **Pipeline Integrity**: Developed `verify_crm_pipeline.py` to ensure lead flow remains stable across all stages.
- **Sales Sync Integrity**: Hardened the handshake between deal registration and the Finance General Ledger (verified via `verify_sales_sync.py`).
- **SLA Tracking**: Integrated "Stale Deal" alerts to flag opportunities requiring urgent agent follow-up.
- **Error Boundary Deployment**: Wrapped all critical frontend modules in React Error Boundaries to eliminate "Page Whiteout" crashes.

---

## 🔘 Previous Accomplishments

### [Infrastructure & Core]
- **Brand Identity**: Standardized the brand name as **"Stohill"** and integrated dynamic, theme-aware logos.
- **Odoo-Style Payroll Refactor**: Implemented a flexible `SalaryRule` and `SalaryStructure` engine for precision payroll processing.
- **Zero-Hardcode Audit**: Verified that all 22+ routes and dashboards are powered by 100% real-time backend data.
