from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from apps.rentals.models import RentalInvoice
from apps.rentals.services.finance_sync import RentalFinanceSyncService
from apps.crm.models import Activity
import logging

logger = logging.getLogger('stohill.rentals.overdue')

class Command(BaseCommand):
    help = 'Processes rental invoice reminders and late interest calculations'

    def handle(self, *args, **options):
        today = timezone.localdate()
        fee_rate = Decimal(str(settings.RENT_LATE_FEE_RATE))
        grace_days = settings.RENT_LATE_FEE_GRACE_DAYS

        # 1. Rent Reminders (3 days before due date) for issued, unpaid invoices.
        # This used to look for DRAFT invoices, which billing never leaves
        # unsent, so no reminder was ever created.
        reminder_date = today + timedelta(days=3)
        upcoming_invoices = RentalInvoice.objects.filter(
            due_date=reminder_date,
            status__in=[RentalInvoice.InvoiceStatus.SENT, RentalInvoice.InvoiceStatus.PARTIAL],
            balance_due__gt=0,
        )
        
        for inv in upcoming_invoices:
            # Create a reminder activity for the tenant
            Activity.objects.get_or_create(
                contact=inv.lease.tenant,
                activity_type=Activity.ActivityType.EMAIL,
                subject=f"Rent Reminder: Invoice {inv.invoice_number}",
                description=f"Automated reminder: Rent for {inv.lease.lease_number} is due on {inv.due_date}. Amount: {inv.total_amount}",
                status=Activity.ActivityStatus.PLANNED,
                due_date=timezone.now()
            )
            self.stdout.write(self.style.SUCCESS(f"Created reminder for invoice {inv.invoice_number}"))

        # 2. Late fee (RENT_LATE_FEE_RATE of rent, once, after the grace period)
        interest_cutoff_date = today - timedelta(days=grace_days)
        overdue_invoices = RentalInvoice.objects.filter(
            due_date__lte=interest_cutoff_date,
            status__in=[RentalInvoice.InvoiceStatus.SENT, RentalInvoice.InvoiceStatus.PARTIAL, RentalInvoice.InvoiceStatus.OVERDUE],
            balance_due__gt=0
        )

        for inv in overdue_invoices:
            # Calculate 10% interest on the original rental amount or balance? 
            # User said "accumulated on the rental charge", usually means on the base rent or total?
            # I'll apply it once if not already applied for this period.
            # We can use a flag or check if late_payment_fee already matches 10%.
            
            interest_amount = (inv.rental_amount * fee_rate).quantize(Decimal('0.01'))

            if inv.late_payment_fee < interest_amount:
                fee_increase = interest_amount - inv.late_payment_fee
                inv.late_payment_fee = interest_amount
                inv.total_amount = inv.rental_amount + inv.vat_amount + inv.other_charges + inv.late_payment_fee
                inv.balance_due = inv.total_amount - inv.amount_paid - inv.credited_amount
                
                # Update status to overdue if not already
                if inv.status != RentalInvoice.InvoiceStatus.OVERDUE:
                    inv.status = RentalInvoice.InvoiceStatus.OVERDUE
                
                with transaction.atomic():
                    inv.save(update_fields=['late_payment_fee', 'total_amount', 'balance_due', 'status'])
                    # Keep AR and the GL in step with the rental sub-ledger.
                    RentalFinanceSyncService.post_late_fee(inv, fee_increase, today)
                
                # Log critical activity
                Activity.objects.create(
                    contact=inv.lease.tenant,
                    activity_type=Activity.ActivityType.NOTE,
                    subject=f"Late Fee Applied: Invoice {inv.invoice_number}",
                    description=f"10% Late payment fee ({interest_amount}) applied to invoice {inv.invoice_number} due to 7+ days delay.",
                    status=Activity.ActivityStatus.COMPLETED
                )
                self.stdout.write(self.style.WARNING(f"Applied 10% interest to invoice {inv.invoice_number}"))
