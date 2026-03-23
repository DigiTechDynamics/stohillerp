from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from apps.rentals.models import RentalInvoice
from apps.crm.models import Activity
import logging

logger = logging.getLogger('stohill.rentals.overdue')

class Command(BaseCommand):
    help = 'Processes rental invoice reminders and late interest calculations'

    def handle(self, *args, **options):
        today = timezone.now().date()
        
        # 1. Rent Reminders (3 days before due date)
        reminder_date = today + timedelta(days=3)
        upcoming_invoices = RentalInvoice.objects.filter(
            due_date=reminder_date,
            status=RentalInvoice.InvoiceStatus.DRAFT
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

        # 2. Late Interest (10% after 7 days overdue)
        interest_cutoff_date = today - timedelta(days=7)
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
            
            interest_amount = inv.rental_amount * Decimal('0.10')
            
            if inv.late_payment_fee < interest_amount:
                inv.late_payment_fee = interest_amount
                inv.total_amount = inv.rental_amount + inv.vat_amount + inv.late_payment_fee
                inv.balance_due = inv.total_amount - inv.amount_paid
                
                # Update status to overdue if not already
                if inv.status != RentalInvoice.InvoiceStatus.OVERDUE:
                    inv.status = RentalInvoice.InvoiceStatus.OVERDUE
                
                inv.save(update_fields=['late_payment_fee', 'total_amount', 'balance_due', 'status'])
                
                # Log critical activity
                Activity.objects.create(
                    contact=inv.lease.tenant,
                    activity_type=Activity.ActivityType.NOTE,
                    subject=f"Late Fee Applied: Invoice {inv.invoice_number}",
                    description=f"10% Late payment fee ({interest_amount}) applied to invoice {inv.invoice_number} due to 7+ days delay.",
                    status=Activity.ActivityStatus.COMPLETED
                )
                self.stdout.write(self.style.WARNING(f"Applied 10% interest to invoice {inv.invoice_number}"))
