from decimal import Decimal
from datetime import date
from django.db import transaction
from apps.finance.services.accounting import AccountingService, PostingData
from apps.properties.models import Property

class PropertyTransferService:
    """
    Service for executing and tracking fund transfers between properties.
    Ensures balanced double-entry postings with proper property-level tagging.
    """
    
    def __init__(self, user=None):
        self.user = user
        self.acc_service = AccountingService(user=user)

    @transaction.atomic
    def execute_transfer(self, from_property_id, to_property_id, amount, reason, transfer_date=None):
        """
        Moves funds from one property's account to another.
        
        Debit: Target Property Account
        Credit: Source Property Account
        """
        from_prop = Property.objects.get(id=from_property_id)
        to_prop = Property.objects.get(id=to_property_id)
        t_date = transfer_date or date.today()
        
        if from_prop.id == to_prop.id:
            raise ValueError("Source and target property cannot be the same.")
            
        if amount <= 0:
            raise ValueError("Transfer amount must be greater than zero.")

        # Determine accounting codes
        # We prioritize property-specific GL accounts if configured, otherwise fallback to Main Bank
        from_acc_code = from_prop.gl_account_code or self.acc_service.ACCOUNTS['BANK_MAIN']
        to_acc_code = to_prop.gl_account_code or self.acc_service.ACCOUNTS['BANK_MAIN']

        posting = PostingData(
            description=f"Property Fund Transfer: {from_prop.name} -> {to_prop.name}",
            entry_date=t_date,
            source_module='finance',
            source_reference=f"XFR-{date.today().strftime('%y%m%d')}"
        )

        # Debit (Increase) Target Property
        posting.add_debit(
            to_acc_code,
            amount,
            f"Received from {from_prop.reference_number}: {reason}",
            property_ref=to_prop
        )

        # Credit (Decrease) Source Property 
        posting.add_credit(
            from_acc_code,
            amount,
            f"Transferred to {to_prop.reference_number}: {reason}",
            property_ref=from_prop
        )

        entry = self.acc_service.post_entry(posting, journal_code='GJ')
        return entry
