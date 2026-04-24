# Project Changes Log - Stohill ERP

## Financial Reports & Document Branding
- **Standardized PDF Engine**: Implemented a unified `PDFService` in the finance module to ensure consistent branding (Stohill Properties logo, professional headers, and generation metadata) across all exported documents.
- **New Report Exports**:
    - Added high-fidelity PDF export for **Accounts Receivable (AR) Aging**.
    - Updated **Trial Balance** and **VAT Return** reports to use the new branded PDF engine.
- **Service Fixes**: Resolved a critical issue in `TaxService.generate_vat_return` where data was not being returned to the export view.
- **Frontend Integration**: Updated `ReportsPage.jsx` to correctly handle different export formats (CSV vs. PDF) with appropriate file extensions and API calls.

## Payroll & Payslip Synchronization
- **Classic Payslip Layout**: Refactored the payslip PDF generation to match the "Classic Zimbabwe" minimalist layout requested by the user.
    - Header: `STOHILL INVESTMENTS (PRIVATE LIMITED) T/A STOHILL PROPERTIES`.
    - Content: Clear split-column view for Earnings and Deductions with double-underline totals.
- **Direct PDF Downloads**: 
    - Implemented `export_pdf` backend action in `PayslipViewSet`.
    - Added a "Download PDF" button to the `PayslipModal` frontend component, replacing the previous browser-print dependency with a server-side generated document for better accuracy.

## HR & Employee Management
- **Date Validation Fix**: Updated `EmployeeSerializer` to support multiple date formats (ISO, YYYY/MM/DD, etc.) for fields like `fidelity_fund_expiry`, resolving recurring "Wrong Format" errors during employee editing.
- **Department Cleanup**: Verified and standardized the list of departments: Marketing, Sales, Procurement, Administration, HR, Finance, and Property Management.
- **Staff Assignments**:
    - Mildred Muzuva -> Sales
    - Moregracious Masawi -> Administration
    - Christine Samavu -> Administration
- **Data Integrity**: 
    - Corrected Yolanda Reilly's profile name to match system authentication records.
    - Removed redundant records (Reilley M Magaya).

## System Stability
- **API Routing**: Verified and corrected routing for financial report exports in `ReportExportView`.
- **Environment Management**: Addressed potential port conflicts between frontend and backend services to ensure seamless local development.
