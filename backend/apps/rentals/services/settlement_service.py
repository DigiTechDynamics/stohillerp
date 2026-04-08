import logging
from decimal import Decimal
from datetime import date
from django.db import transaction
from django.db.models import Sum
from django.conf import settings

logger = logging.getLogger('stohill.rentals.settlement')

class OwnerSettlementService:
    """
    Automates the calculation and generation of property owner settlements.
    """

    @staticmethod
    def get_vat_rate():
        """Fetch standard VAT rate from TaxCode settings."""
        from apps.finance.models.tax import TaxCode
        try:
            # Prefer database-configured STD TaxCode
            std_tax = TaxCode.objects.get(code='STD', is_active=True)
            return std_tax.rate / Decimal('100.00')
        except (TaxCode.DoesNotExist, Exception):
            return Decimal(str(settings.COMPANY_CONFIG.get('vat_rate', '0.15')))

    @classmethod
    @transaction.atomic
    def generate_monthly_settlements(cls, month: int, year: int):
        """
        Calculates and creates draft settlements for all properties with owners.
        Only accounts for PAID rental portions (Cash Basis).
        """
        from django.apps import apps
        RentalPayment = apps.get_model('rentals', 'RentalPayment')
        MaintenanceRequest = apps.get_model('rentals', 'MaintenanceRequest')
        Lease = apps.get_model('rentals', 'Lease')
        OwnerSettlement = apps.get_model('rentals', 'OwnerSettlement')
        Property = apps.get_model('properties', 'Property')
        import calendar
        period_start = date(year, month, 1)
        last_day = calendar.monthrange(year, month)[1]
        period_end = date(year, month, last_day)

        # 1. Selection: Find properties with owners
        managed_properties = Property.objects.filter(owner__isnull=False)
        
        results = {
            'settlements_created': 0,
            'total_net_payout': Decimal('0.00'),
            'errors': []
        }

        vat_rate = cls.get_vat_rate()

        for prop in managed_properties:
            try:
                # 2. Revenue: Sum all payments received in this period for this property
                # Logic: Payments linked to invoices for this property
                payments = RentalPayment.objects.filter(
                    payment_date__range=[period_start, period_end],
                    invoice__lease__property=prop
                )

                if not payments.exists():
                    continue

                total_collected = payments.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
                
                # 3. Expenses: Sum maintenance requests completed in this period and NOT billed to tenant
                maintenance_costs = MaintenanceRequest.objects.filter(
                    property=prop,
                    status=MaintenanceRequest.Status.COMPLETED,
                    completed_date__date__range=[period_start, period_end],
                    billed_to_tenant=False
                ).aggregate(total=Sum('actual_cost'))['total'] or Decimal('0.00')

                # 4. Other Expenses from Property model
                # (Pro-rated or full monthly depending on business rule - here we take full monthly)
                other_expenses = prop.rates_monthly + prop.levies_monthly + prop.insurance_monthly

                # 5. Management Fee
                # We use the active lease for this property to find the fee rate
                active_lease = Lease.objects.filter(
                    property=prop, 
                    status=Lease.LeaseStatus.ACTIVE
                ).first()
                
                fee_rate = active_lease.management_fee_rate if active_lease else Decimal('10.00')
                
                # Fee is usually calculated on the Rent portion of collected funds
                # For simplicity here we use the total collected
                management_fee = (total_collected * (fee_rate / Decimal('100.00'))).quantize(Decimal('0.01'))
                vat_on_fee = (management_fee * vat_rate).quantize(Decimal('0.01'))

                # 6. Final Calculation
                expenses_deducted = maintenance_costs + other_expenses
                net_payout = total_collected - (management_fee + vat_on_fee) - expenses_deducted

                # 7. Create Settlement Record
                settlement = OwnerSettlement.objects.create(
                    owner=prop.owner,
                    property=prop,
                    period_start=period_start,
                    period_end=period_end,
                    currency=prop.currency,
                    total_rent_collected=total_collected,
                    management_fee_amount=management_fee + vat_on_fee,
                    expenses_deducted=expenses_deducted,
                    net_payout_amount=net_payout,
                    status=OwnerSettlement.SettlementStatus.DRAFT,
                    notes=f"Auto-generated settlement for {period_start.strftime('%B %Y')}. "
                          f"Fee: {fee_rate}%. "
                          f"VAT: {vat_rate*100}%."
                )

                results['settlements_created'] += 1
                results['total_net_payout'] += net_payout
                logger.info(f"Created draft settlement for {prop.name}: {net_payout}")

            except Exception as e:
                results['errors'].append(f"Property {prop.reference_number}: {str(e)}")
                logger.error(f"Settlement failed for property {prop.name}: {e}")

        return results

    @classmethod
    @transaction.atomic
    def process_and_post_settlement(cls, settlement, user=None):
        """
        Approves a settlement and posts the corresponding Journal Entry to Finance.
        """
        from django.apps import apps
        OwnerSettlement = apps.get_model('rentals', 'OwnerSettlement')
        
        if settlement.status != OwnerSettlement.SettlementStatus.DRAFT:
            raise ValueError("Only draft settlements can be processed.")

        from apps.finance.services.accounting import AccountingService, PostingData
        accounting = AccountingService(user=user)

        # 1. Prepare Posting Data
        description = f"Owner Settlement: {settlement.property.name} ({settlement.period_start.strftime('%b %Y')})"
        posting = PostingData(
            description=description,
            entry_date=date.today(),
            source_module='rentals',
            source_id=str(settlement.id),
            source_reference=str(settlement.id),
            currency_code=settlement.currency.code
        )

        # 2. Build Lines
        # Debit: Rental Income (Holding account - reducing the revenue to pay owner)
        rental_income_acc = accounting.get_account('RENTAL_INCOME')
        posting.add_debit(rental_income_acc, settlement.total_rent_collected, property_ref=settlement.property)

        # Credit: Management Fee Income (Revenue for company)
        mgmt_fee_acc = accounting.get_account('MANAGEMENT_FEES')
        # Note: We split management fee and VAT
        vat_rate = cls.get_vat_rate()
        gross_fee = (settlement.management_fee_amount / (Decimal('1.0') + vat_rate)).quantize(Decimal('0.01'))
        vat_amount = settlement.management_fee_amount - gross_fee
        
        posting.add_credit(mgmt_fee_acc, gross_fee, description="Management Fee Component")
        
        # Credit: VAT Payable
        vat_acc = accounting.get_account('VAT_PAYABLE')
        posting.add_credit(vat_acc, vat_amount, description="VAT on Management Fee")

        # Credit: Accounts Payable (Owner)
        ap_acc = accounting.get_account('ACCOUNTS_PAYABLE')
        posting.add_credit(ap_acc, settlement.net_payout_amount, contact_ref=settlement.owner)

        # Credit: Expenses (Granular reimbursement to company)
        prop = settlement.property
        # Rates & Levies
        if prop.rates_monthly > 0 or prop.levies_monthly > 0:
            rates_acc = accounting.get_account('RATES_AND_LEVIES')
            posting.add_credit(rates_acc, prop.rates_monthly + prop.levies_monthly, property_ref=prop)
            
        # Insurance
        if prop.insurance_monthly > 0:
            ins_acc = accounting.get_account('INSURANCE')
            posting.add_credit(ins_acc, prop.insurance_monthly, property_ref=prop)

        # Maintenance (Remainder of expenses deducted)
        calculated_other = prop.rates_monthly + prop.levies_monthly + prop.insurance_monthly
        maintenance_remainder = settlement.expenses_deducted - calculated_other
        if maintenance_remainder > 0:
            maint_acc = accounting.get_account('MAINTENANCE')
            posting.add_credit(maint_acc, maintenance_remainder, property_ref=prop)

        # 3. Post Entry
        try:
            je = accounting.post_entry(posting, journal_code='GJ')
            
            # 4. Update Settlement Status
            settlement.status = OwnerSettlement.SettlementStatus.PAID
            settlement.journal_entry = je
            settlement.payment_date = date.today()
            settlement.save(update_fields=['status', 'journal_entry', 'payment_date'])
            
            return je
        except Exception as e:
            logger.error(f"Accounting post failed for settlement {settlement.id}: {e}")
            raise
