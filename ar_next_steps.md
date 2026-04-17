# Stohill ERP - AR & Rental Next Steps (Phase 2 & 3)

Following the successful completion of the Phase 1 Reporting and the Initial Bank Reconciliation milestones, the platform is now moving toward full operational automation. The next steps focus on the remaining high-impact features of Phase 2 and transitioning into mobile field operations.

---

## 🏛️ 1. Proactive Lease Escalation Engine
Currently, the system handles monthly billing but requires manual intervention for annual rent increases.
- **Service**: Implement a `LeaseEscalationService` that scans for leases approaching their anniversary (e.g., 60 days in advance).
- **Automation**: Automatically calculate the new rent based on the `rental_escalation_rate` (default 8%).
- **PDF Generation**: Utilize the existing `PDFService` to generate a professional **"Notice of Rent Increase"** document using ReportLab.
- **Communication**: Queue a system notification (and eventually WhatsApp/Email) with the attached PDF for tenant review.

## ⚖️ 2. Deposit Trust Management & Settlement
Accurately handling tenant deposits is critical for legal compliance and financial integrity.
- **GL Integration**: Ensure all `deposit_amount` collections are automatically credited to the "Tenant Deposit Liability" account in the general ledger.
- **Settlement Wizard**: Build a new frontend workflow for Lease Terminations that:
    1.  Calculates the total deposit held for the specific lease.
    2.  Offsets any outstanding `RentalInvoices` or maintenance costs.
    3.  Generates a final **Closing Statement** and a refund instruction for the Finance and Treasury teams.

## 📱 3. Field-Survey & Move-In/Out PWA
- **Mobile Refinement**: Enhance the existing `PropertyInspectionWizard` with "Sync Status" indicators to prepare for full offline PWA capabilities.
- **Photo Uploads**: Optimize the compression of high-resolution on-site photos before syncing to the document management module.

---

## ❓ Open Questions / Decisions
> [!IMPORTANT]
> **Escalation Approval workflow**: Should the system **auto-apply** the new rent amount on the anniversary date after the notice is sent, or should it require a manager's "One-Click Approval" for the final G/L update?
> [!NOTE]
> **Deposit Location**: Should interest accrued on tenant deposits be tracked and returned (required for some commercial contracts), or is it purely a non-interest-bearing liability?
