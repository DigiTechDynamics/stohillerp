import logging
from decimal import Decimal
from datetime import date, timedelta
from django.db import transaction
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from apps.finance.services.pdf_service import PDFService
from apps.notifications.models import Notification

logger = logging.getLogger('stohill.rentals.escalation')

class LeaseEscalationService:
    """
    Service to manage annual rental escalations proactively.
    Handles finding upcoming escalations, generating notices, and notifying staff/tenants.
    """

    @staticmethod
    def get_escalation_details(lease, target_date=None):
        """
        Calculates the projected rent increase for a lease.
        """
        if target_date is None:
            target_date = date.today()

        old_rental = lease.monthly_rental
        escalation_factor = (Decimal('100.00') + lease.rental_escalation_rate) / Decimal('100.00')
        new_rental = (old_rental * escalation_factor).quantize(Decimal('0.01'))
        
        # Calculate anniversary date
        # If today is 2026-04-24 and start_date was 2024-06-01
        # The next anniversary is 2026-06-01
        anniversary_date = date(target_date.year, lease.start_date.month, lease.start_date.day)
        if anniversary_date < target_date:
            anniversary_date = date(target_date.year + 1, lease.start_date.month, lease.start_date.day)
            
        return {
            'old_rental': old_rental,
            'new_rental': new_rental,
            'escalation_rate': lease.rental_escalation_rate,
            'effective_date': anniversary_date
        }

    @staticmethod
    def find_upcoming_escalations(days_advance=60, target_date=None):
        """
        Finds active leases that have an anniversary in exactly days_advance days.
        """
        from apps.rentals.models import Lease
        if target_date is None:
            target_date = date.today()
            
        notice_date = target_date + timedelta(days=days_advance)
        
        # We need to find leases whose (month, day) matches notice_date
        # and where notice_date is at least 12 months after start_date.
        upcoming_leases = Lease.objects.filter(
            status=Lease.LeaseStatus.ACTIVE,
            start_date__month=notice_date.month,
            start_date__day=notice_date.day
        )
        
        # Filter for those that are actually due for escalation (at least 1 year old)
        due_leases = []
        for lease in upcoming_leases:
            # Check if this anniversary is at least 12 months from start
            years_diff = notice_date.year - lease.start_date.year
            if years_diff >= 1:
                # Also check if we already sent a notice recently for this anniversary
                # or if the escalation was already applied (unlikely if 60 days out)
                due_leases.append(lease)
                
        return due_leases

    @staticmethod
    @transaction.atomic
    def process_escalation_notices(days_advance=60, target_date=None):
        """
        Orchestrates the proactive escalation notification process.
        """
        from apps.core.models import User
        if target_date is None:
            target_date = date.today()
            
        leases = LeaseEscalationService.find_upcoming_escalations(days_advance, target_date)
        
        results = {
            'notices_sent': 0,
            'failed': 0,
            'errors': []
        }
        
        # Get property manager or admin to notify
        # For now, we notify all superusers or a specific role
        recipients = User.objects.filter(is_superuser=True)

        for lease in leases:
            try:
                details = LeaseEscalationService.get_escalation_details(lease, target_date + timedelta(days=days_advance))
                
                # 1. Generate PDF Notice
                pdf_content = PDFService.generate_rent_increase_notice_pdf(
                    lease=lease,
                    new_rental=details['new_rental'],
                    effective_date=details['effective_date']
                )
                
                # 2. Log in Audit Trail
                from apps.core.models import AuditLog
                AuditLog.objects.create(
                    action=AuditLog.ActionType.UPDATE,
                    model_name='Lease',
                    object_id=str(lease.id),
                    object_repr=f"Escalation Notice Prepared for {lease.lease_number}",
                    changes={
                        'notice_sent_date': str(target_date),
                        'projected_new_rental': str(details['new_rental']),
                        'effective_date': str(details['effective_date'])
                    }
                )
                
                # 3. Create System Notifications for staff
                for recipient in recipients:
                    Notification.objects.create(
                        recipient=recipient,
                        verb='scheduled a rent increase notice',
                        description=f"Rent increase notice for {lease.lease_number} ({lease.tenant.full_name}) has been prepared. Effective: {details['effective_date']}",
                        level=Notification.Level.INFO,
                        module='rentals',
                        target_content_type=ContentType.objects.get_for_model(lease),
                        target_object_id=str(lease.id)
                    )
                
                # 4. (Future) Send via Email/WhatsApp
                # logger.info(f"Escalation notice PDF generated for {lease.lease_number}")
                
                results['notices_sent'] += 1
                
            except Exception as e:
                results['failed'] += 1
                error_msg = f"Failed to process escalation notice for {lease.lease_number}: {str(e)}"
                results['errors'].append(error_msg)
                logger.error(error_msg)
                
        return results
