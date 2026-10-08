# Property management: comparison with MRI MDA

This compares the property code with MDA's publicly known features, not an MRI spec sheet.

The property code is split across three apps in `backend/apps`:

- `properties`: buildings, units, owners
- `rentals`: leases, invoices, payments, maintenance
- `propman`: the more advanced operations

Overall the system follows the same model as MDA, especially for commercial property, and uses South African conventions (debit orders, CPI escalations, municipal rates recoveries, trust accounting).

## Features that match MDA

| MDA feature | Here |
|---|---|
| Property, unit and area setup (GLA) | `Property`, `PropertyUnit` with lettable area (`floor_size`), `Portfolio` |
| Leases with fixed, stepped or CPI escalations | `Lease.escalation_type`, `EscalationStep`, `CPIIndex` |
| Options, break clauses, guarantees, sureties | `LeaseOption`, `LeaseGuarantee` |
| Turnover (percentage) rent | `TurnoverReport`, `Lease.turnover_rent_percent` |
| Monthly billing run with recurring charges | `RentalInvoice` with `LeaseCharge` lines, `generate_rental_invoices` command |
| Recoveries split by area, percentage or equally, with a year-end true-up | `RecoverySchedule`, `RecoveryShare`, `RecoveryReconciliation` |
| Utility recharges from meters, stepped tariffs, bulk and sub-meters | `UtilityTariff`, `Meter` (with `bulk_meter`), `MeterReading` |
| Arrears management with stages, letters of demand and legal handover | `ArrearsStage`, `ArrearsCase`, `ArrearsAction` |
| Debit orders | `DebitOrderMandate`, `DebitOrderBatch` |
| Deposits held in trust, with interest | Deposit receipting, `DepositInterest` |
| Owner trust accounting, statements, payment runs, management and letting fees | `rentals/owners.py`, `OwnerPaymentRun` with bank file, `PropertyOwnership` for split owners |
| Posting to the GL and accounts receivable | `rentals/services/finance_sync.py` |
| Maintenance with contractor quotes, owner approval and planned jobs | `MaintenanceQuote`, `MaintenancePlan`, contractor and owner portals |
| Rent roll, lease expiry, vacancy, arrears ageing reports | `propman/services/reports.py`, with scheduled e-mailing |

## Gaps

1. **Each property doesn't have its own books.** MDA usually runs a separate ledger per property or owning company. Here there is one company GL, and properties are only tagged on transactions (`Property.gl_account_code`).
2. **No full property budgets.** The only budget is the annual figure on a recovery schedule (`RecoverySchedule.annual_budget`). MDA budgets and forecasts each property's whole income and expenses.
3. **No interest on arrears.** There is a flat `RentalInvoice.late_payment_fee`, but no interest charged on overdue balances.
4. **No tenant ledger across invoices.** Payments are tied to a single invoice (`RentalPayment.invoice`). MDA works from a running tenant account, where receipts are allocated across what's owed and unallocated credits are carried.
5. **No reconciliation of municipal bills against recoveries.** Bulk and sub-meters are linked, but nothing compares a council bill with what was recovered from tenants, or reports the loss between them.
6. **No area history.** Unit area is a single field, so there's no history of units being split or merged over time.
7. **Smaller report set.** There are 5 reports (rent roll, lease expiry, vacancy, arrears, property income), against MDA's much larger library.
