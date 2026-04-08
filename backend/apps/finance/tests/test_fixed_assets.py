import os
from decimal import Decimal
from datetime import date
from django.test import TestCase
from apps.finance.services.accounting import AccountingService, PostingData, AccountingError
from apps.finance.models import JournalEntry
from apps.finance.tests.base_finance import FinanceBaseTestCase

class FixedAssetsTests(FinanceBaseTestCase):
    """
    Test Fixed Asset financial lifecycle: Acquisition and Depreciation.
    """

    def setUp(self):
        super().setUp()
        self.service = AccountingService(user=None)
        
        # Setup specific Asset accounts
        self.acc_asset, _ = ChartOfAccount.objects.get_or_create(
            code='1600',
            defaults={'name': 'Motor Vehicles', 'account_type': 'asset'}
        )
        self.acc_accum_depr, _ = ChartOfAccount.objects.get_or_create(
            code='1601',
            defaults={'name': 'Accumulated Depreciation - Vehicles', 'account_type': 'asset'}
        )
        self.acc_depr_exp, _ = ChartOfAccount.objects.get_or_create(
            code='5700',
            defaults={'name': 'Depreciation Expense', 'account_type': 'expense'}
        )

    def test_asset_acquisition_gl_impact(self):
        """Verify that acquiring a fixed asset increases the asset balance and records AP."""
        # Acquisition cost: 15,000.00
        cost = Decimal('15000.00')
        data = PostingData(
            description="Vehicle Acquisition - Toyota Hilux",
            entry_date=date.today(),
            source_module='fixed_assets',
            source_id=101,
            source_reference="ASSET-V01",
        )
        data.add_debit('1600', cost, "Asset recognition")
        data.add_credit(self.accounts['2000'].code, cost, "AP - Vehicle Supplier")

        # Post
        self.service.post_entry(data)
        
        self.acc_asset.refresh_from_db()
        self.accounts['2000'].refresh_from_db()
        self.assertEqual(self.acc_asset.current_balance, cost)
        self.assertEqual(self.accounts['2000'].current_balance, cost)

    def test_depreciation_posting_integrity(self):
        """Verify that depreciation correctly debits expense and credits accumulated (contra-asset)."""
        # Depreciation amount: 250.00
        depr_amount = Decimal('250.00')
        data = PostingData(
            description="Monthly Depreciation - Vehicles",
            entry_date=date.today(),
            source_module='fixed_assets',
            source_id=101,
            source_reference="DEPR-2026-04",
        )
        data.add_debit('5700', depr_amount, "Depreciation Expense")
        data.add_credit('1601', depr_amount, "Contra-Asset credit")

        # Post
        self.service.post_entry(data)
        
        self.acc_depr_exp.refresh_from_db()
        self.acc_accum_depr.refresh_from_db()

        # Expense Debit increases it:
        self.assertEqual(self.acc_depr_exp.current_balance, depr_amount)
        # Asset Credit decreases it (Normal balance of contra-asset is Credit):
        # Normal Asset (1600) is Debit. Contra-Asset (1601) is Credit.
        # In AccountingService logic, the credit to an asset decreases its balance.
        self.assertEqual(self.acc_accum_depr.current_balance, -depr_amount)
