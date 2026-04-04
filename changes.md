# Stohill ERP - Log of Changes

This document tracks the evolution of the Stohill ERP, documenting fixes, features, and architectural improvements organized by module and date.

## 🔵 Today: 4 April 2026 (14:00)

### [Internationalization & Localization]
- **Base Currency Migration (ZAR to USD)**: Completed a system-wide transition of the primary reporting currency to USD ($).
- **Zimbabwe Market Adaptation**: Updated `TIME_ZONE` to `Africa/Harare` and configured the fiscal year to start in **January** per local tax standards.
- **Bulk Data Migration**: Executed `migrate_to_usd.py` to update all existing Properties (20), Sales (12), Leases, and Financial Accounts (13) to the new USD/Zimbabwe context.
- **Dynamic Formatting**: Updated `formatCurrency` utilities in the frontend to ensure all dashboards (Sales, Kanban, Leases) reflect USD pricing.

### [User Access & RBAC Consolidation]
- **Core Team Provisioning**: Registered and configured access for the management team: **Nyarai Mubvumbi (MD)**, **Reilly M Magaya (Sales)**, **Tinotenda (Accounting)**, and **Yolanda (Rentals)**.
- **Audit-Safe Account Cleanup**: Deleted duplicate and system accounts (`admin@stohill.com`, `reilly@stohillproperties...`) and reassigned all legacy financial/audit records to the new primary superuser account (`nmubvumbi@stohillproperties.co.zw`).
- **Role Permissions Seeding**: Verified all 11 system roles are correctly seeded and mapped to their respective operational modules.

### [Document Management System (DMS)]
- **Workspace Initialization**: Created 6 professional workspaces (folders) for logical organization: *Legal & Compliance*, *Property Records*, *Tenancy*, *Finance & Tax*, *Sales & Marketing*, and *HR & Payroll*.
- **Role-Based Filing Access**: Granted Documents module access to Sales and Finance managers with automated visibility into their specific workspaces.

### [Finance & Accounting]
- **Full Ledger Access**: Elevated **Tinotenda** to **Finance Manager**, granting full access to GL, AP, AR, Banking, Fixed Assets, Tax, and Payroll modules.
- **Accounting Module Restoration**: Re-seeded missing sub-modules (Accounts Payable, Receivable, GL) and assigned them to high-privilege financial roles.

---

## 🟡 Yesterday: 3 April 2026

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

## 🟡 Yesterday: 2 April 2026

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
