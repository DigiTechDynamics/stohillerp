# Stohill ERP - Log of Changes

This document tracks the evolution of the Stohill ERP, documenting fixes, features, and architectural improvements organized by module and date.

## 🔵 Today: 15 April 2026

### [Finance Module Configuration]
- **Chart of Accounts Initialization**: Implemented and executed a custom initialization script to seed the system's Chart of Accounts. Created 55 new accounts and updated 19, fully mapping standard assets, liabilities, equity, revenue, and expenses.
- **Account Hierarchy**: Linked accounts with parent-child relationships, ensuring header accounts (like 'Inventory' or 'Depreciation') restrict direct posting while their sub-accounts correctly accept general ledger transactions.

---

## 🟡 8 April 2026

### [Rentals & Finance Integration]
- **Automated Test Stabilization**: Achieved 100% pass rate for the `apps.rentals` suite, resolving recursive `IntegrityError` and model mismatch issues.
- **Precision Tax Synchronization**: Enhanced `RentalFinanceSyncService` to dynamically lookup `TaxCode` (VAT15) and apply it to `CustomerInvoiceLine` entries.
- **Balanced GL Entry Logic**: Corrected the synchronization engine to use the gross amount (total_amount) for `line_total`, ensuring all mirrored financial records balance perfectly in the General Ledger.
- **Service Hardening**: Resolved a critical attribute error in the `LeaseBillingService` by removing the deprecated `description` field from `AuditLog` creation.

### [Test Infrastructure]
- **Robust Financial Base**: Refactored `FinanceBaseTestCase` to provide 12 months of pre-configured fiscal periods and a default `BankAccount`, eliminating "No fiscal period found" setup errors.
- **Unit Occupancy Verification**: Updated `Lease.activate()` to trigger atomic `PropertyUnit` status transitions and added `refresh_from_db()` assertions to lifecycle tests.

---

## 🟡 7 April 2026

### [Executive Intelligence & BI]
- **Module-Aware Dashboards**: Launched the new **Executive Command Center**, providing real-time KPI visibility across Sales, Rentals, Finance, and Supply Chain modules.
- **Contextual Redirection**: Implemented role-based login routing that automatically detects `marketing_manager` or `finance_manager` identities and redirects to targeted dashboards.

### [Finance Bridge Refactor]
- **Attribute Mapping Fixes**: Resolved systematic test failures by aligning `PropertyUnit` and `Contact` model references with the latest core schemas.
- **Cross-Module Sync Integrity**: Verified that `Lease` renewals and terminations correctly trigger mirrored financial transactions in the `apps.finance` module.

---

## 🟡 6 April 2026

### [Supply Chain & Logistics]
- **Procurement Portal Hardening**: Resolved a critical unresponsive state in the **Purchase Order** creation workflow, enabling seamless RFQ-to-Bill processing.
- **Inventory UI Stability**: Fixed a graphical crash in the **Inventory Dashboard** caused by `AnimatePresence` mismatches during stock movement renders.
- **Double-Entry Operations**: Verified end-to-end stock movements from receipt to storage, ensuring inventory balances remain 100% accurate.

### [User Experience]
- **Role-Based Navigation**: Deployed department-specific navigation menus to streamline workflows for HR, Procurement, and Property Management teams.

---

## 🟡 4 April 2026 (14:00)

### [Internationalization & Localization]
- **Base Currency Migration (ZAR to USD)**: Completed a system-wide transition of the primary reporting currency to USD ($).
- **Zimbabwe Market Adaptation**: Updated `TIME_ZONE` to `Africa/Harare` and configured the fiscal year to start in **January** per local tax standards.
- **Bulk Data Migration**: Executed `migrate_to_usd.py` to update all existing Properties (20), Sales (12), Leases, and Financial Accounts (13) to the new USD/Zimbabwe context.
- **Dynamic Formatting**: Updated `formatCurrency` utilities in the frontend to ensure all dashboards (Sales, Kanban, Leases) reflect USD pricing.

---

## 🟡 3 April 2026

### [CRM & Activity Management]
- **Interactive Calendar Scheduling**: Finalized the CRM Calendar with full support for creating and editing activities from the month view.
- **Backend Date Range Filtering**: Optimized Activity endpoints to support high-performance fetching for calendar grids.
- **Automated Reminder System**: Launched background tasks and management commands for upcoming activity notifications.
- **Activity Detail Inspector**: Integrated `ActivityForm` with the side panel for seamless activity logging and status updates.

### [Property Maintenance & Website Integration]
- **Public Maintenance API**: Launched a secure, unauthenticated endpoint for external website logging.
- **Tenant Verification Engine**: Implemented `lease_number` + `email` validation to ensure only authorized residents can log tickets.
- **Maintenance Command Center**: Developed a high-fidelity `MaintenanceDetailPanel.jsx` for agent assignments and cost tracking.
- **Lifecycle Automation**: Added logic for status transitions (Logged → In Progress → Completed) with resolution audit trails.
- **Origin Tracking**: Integrated a "Website" origin indicator to distinguish external requests from internal staff logs.
- **External Integration Guide**: Created `website_integration_guide.md` with ready-to-use JavaScript snippets for the company web developer.

---

## 🟡 2 April 2026

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

## 🔘 Previous Accomplishments

### [Finance - Sage 200 Evolution Standards]
- **Batch Posting Engine**: Transitioned all financial entries to accountable `JournalBatch` workflows with Maker/Checker validation.
- **Automated Commission Accruals**: Integrated real-time G/L posting for agent commissions during sales deal registration.
- **Cost Center Profitability**: Added property-level filtering to Trial Balance and Income Statement reports.

### [Rental & Property Operations]
- **Fully-Automated Billing Cycle**: Developed `BillingService.py` and `process_rent_billing` management command for bulk monthly invoicing.
- **Annual Escalation Engine**: Implemented logic for automated rent increases based on lease anniversary dates.

### [CRM Workflow Updates]
- **Kanban Deal Stability**: Resolved a critical UUID primary key collision bug in `Opportunity.save()`.
- **Pipeline Integrity**: Developed `verify_crm_pipeline.py` to ensure lead flow remains stable across all stages.
- **Error Boundary Deployment**: Wrapped all critical frontend modules in React Error Boundaries to eliminate "Page Whiteout" crashes.

### [Infrastructure & Core]
- **Brand Identity**: Standardized the brand name as **"Stohill"** and integrated dynamic, theme-aware logos.
- **Odoo-Style Payroll Refactor**: Implemented a flexible `SalaryRule` and `SalaryStructure` engine for precision payroll processing.
- **Zero-Hardcode Audit**: Verified that all 22+ routes and dashboards are powered by 100% real-time backend data.
