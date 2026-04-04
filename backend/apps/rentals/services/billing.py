import logging
from decimal import Decimal
from datetime import date, timedelta
from django.db import transaction
from django.conf import settings
from apps.rentals.models import Lease, RentalInvoice

logger = logging.getLogger('stohill.rentals.billing')

class LeaseBillingService:
    @staticmethod
    @transaction.atomic
    def generate_monthly_invoices(target_date=None):
        """
        Scans all active leases due for invoicing and generates RentalInvoice records.
        """
        if target_date is None:
            target_date = date.today()
            
        # 1. Find active leases due for invoicing
        due_leases = Lease.objects.filter(
            status=Lease.LeaseStatus.ACTIVE,
            next_invoice_date__lte=target_date
        )
        
        results = {
            'processed': 0,
            'failed': 0,
            'errors': []
        }
        
        # Standard South Africa VAT from settings
        vat_rate = Decimal(str(settings.COMPANY_CONFIG.get('vat_rate', '0.15')))
        
        for lease in due_leases:
            try:
                # 2. Calculate dates for the invoice period
                # Period starts on the next_invoice_date (usually 1st of month)
                period_start = lease.next_invoice_date
                
                import calendar
                last_day = calendar.monthrange(period_start.year, period_start.month)[1]
                period_end = date(period_start.year, period_start.month, last_day)
                
                # Payment due X days after period start
                due_date = period_start + timedelta(days=lease.payment_due_days)

                # 3. Calculate amounts
                rental_amount = lease.monthly_rental
                vat_amount = Decimal('0.00')
                if lease.vat_applicable:
                    vat_amount = (rental_amount * vat_rate).quantize(Decimal('0.01'))
                
                total_amount = rental_amount + vat_amount
                
                # 4. Create the Invoice in DRAFT
                invoice = RentalInvoice.objects.create(
                    lease=lease,
                    currency=lease.currency,
                    period_start=period_start,
                    period_end=period_end,
                    due_date=due_date,
                    rental_amount=rental_amount,
                    vat_amount=vat_amount,
                    total_amount=total_amount,
                    balance_due=total_amount,
                    status=RentalInvoice.InvoiceStatus.DRAFT
                )
                
                # 5. Advance the Lease billing dates
                lease.last_invoiced_date = period_start
                lease.next_invoice_date = lease.calculate_next_invoice_date(after_date=period_start)
                lease.save(update_fields=['last_invoiced_date', 'next_invoice_date'])
                
                # 6. Finalize the invoice
                # This triggers RentalInvoice.save() which calls sync_rental_invoice_to_ar
                invoice.status = RentalInvoice.InvoiceStatus.SENT
                invoice.save(update_fields=['status'])
                
                results['processed'] += 1
                logger.info(f"Generated and synced invoice {invoice.invoice_number} for Lease {lease.lease_number}")
                
            except Exception as e:
                results['failed'] += 1
                error_msg = f"Failed to invoice Lease {lease.lease_number}: {str(e)}"
                results['errors'].append(error_msg)
                logger.error(error_msg)
                
        return results

    @staticmethod
    @transaction.atomic
    def apply_late_fees(target_date=None):
        """
        Scans overdue invoices and applies late payment penalties.
        A 5-day grace period is applied.
        """
        if target_date is None:
            target_date = date.today()
            
        grace_period = 5
        # Invoices due before this date are eligible for penalties
        late_threshold = target_date - timedelta(days=grace_period)
        
        # 1. Find SENT or PARTIAL invoices that are past due date + grace
        # We only apply late fees once (where late_payment_fee is 0.00)
        overdue_invoices = RentalInvoice.objects.filter(
            status__in=[RentalInvoice.InvoiceStatus.SENT, RentalInvoice.InvoiceStatus.PARTIAL],
            due_date__lt=late_threshold,
            late_payment_fee=Decimal('0.00')
        )
        
        results = {
            'applied': 0,
            'total_penalties': Decimal('0.00'),
            'errors': []
        }
        
        for inv in overdue_invoices:
            try:
                # Default late fee: $100 or 100 Local Currency
                # Future enhancement: Make this configurable per lease
                fee_amount = Decimal('100.00')
                
                inv.late_payment_fee = fee_amount
                inv.total_amount += fee_amount
                inv.balance_due += fee_amount
                inv.status = RentalInvoice.InvoiceStatus.OVERDUE
                inv.save(update_fields=['late_payment_fee', 'total_amount', 'balance_due', 'status'])
                
                # 2. Re-sync to Finance AR to reflect new balance
                from apps.rentals.services.finance_sync import RentalFinanceSyncService
                RentalFinanceSyncService.sync_rental_invoice_to_ar(inv)
                
                results['applied'] += 1
                results['total_penalties'] += fee_amount
                logger.info(f"Applied late fee to invoice {inv.invoice_number}")
                
            except Exception as e:
                error_msg = f"Failed to apply late fee to {inv.invoice_number}: {str(e)}"
                results['errors'].append(error_msg)
                logger.error(error_msg)
                
        return results

    @staticmethod
    @transaction.atomic
    def process_escalations(target_date=None):
        """
        Scans all active leases and applies the contractual rent escalation 
        if the current month matches the lease anniversary.
        """
        if target_date is None:
            target_date = date.today()
            
        due_leases = Lease.objects.filter(status=Lease.LeaseStatus.ACTIVE)
        
        results = {
            'escalations_applied': 0,
            'skipped': 0,
            'errors': []
        }
        
        for lease in due_leases:
            try:
                # 1. Determine anniversary month/day
                # Anniversary is every 12 months from start_date
                years_diff = target_date.year - lease.start_date.year
                months_diff = years_diff * 12 + (target_date.month - lease.start_date.month)
                
                # We only escalate if at least 12 months have passed and it's an exact multiple of 12
                if months_diff < 12 or months_diff % 12 != 0:
                    results['skipped'] += 1
                    continue
                
                # 2. Prevent double-escalation in the same month
                if lease.last_escalation_date and \
                   lease.last_escalation_date.year == target_date.year and \
                   lease.last_escalation_date.month == target_date.month:
                    results['skipped'] += 1
                    continue
                
                # 3. Apply Escalation
                old_rental = lease.monthly_rental
                escalation_factor = (Decimal('100.00') + lease.rental_escalation_rate) / Decimal('100.00')
                new_rental = (old_rental * escalation_factor).quantize(Decimal('0.01'))
                
                lease.monthly_rental = new_rental
                lease.last_escalation_date = target_date
                lease.save(update_fields=['monthly_rental', 'last_escalation_date'])
                
                # 4. Audit Log
                from apps.core.models import AuditLog
                AuditLog.objects.create(
                    action=AuditLog.ActionType.UPDATE,
                    model_name='Lease',
                    object_id=str(lease.id),
                    object_repr=str(lease),
                    changes={
                        'monthly_rental': {
                            'old': str(old_rental),
                            'new': str(new_rental)
                        },
                        'escalation_rate': str(lease.rental_escalation_rate)
                    },
                    description=f"Annual rent escalation applied. Increased by {lease.rental_escalation_rate}%."
                )
                
                results['escalations_applied'] += 1
                logger.info(f"Applied {lease.rental_escalation_rate}% escalation to Lease {lease.lease_number}. New rent: {new_rental}")
                
            except Exception as e:
                error_msg = f"Failed to escalate Lease {lease.lease_number}: {str(e)}"
                results['errors'].append(error_msg)
                logger.error(error_msg)
                
        return results
