from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from dateutil.relativedelta import relativedelta
from ..models import FixedAsset, AssetBook, AssetTransaction
from apps.finance.services.accounting import AccountingService

class DepreciationService:
    """Service to handle depreciation calculations and GL postings."""
    
    def __init__(self, user=None):
        self.user = user

    def calculate_straight_line(self, book: AssetBook, months=1):
        """Standard straight-line (Cost - Salvage) / Useful Life."""
        asset = book.asset
        monthly_depr = (asset.acquisition_cost - book.salvage_value) / book.useful_life_months
        return (monthly_depr * months).quantize(Decimal('0.01'))

    def calculate_declining_balance(self, book: AssetBook, months=1):
        """Declining balance depreciation based on a fixed rate."""
        if not book.depreciation_rate:
            return Decimal('0.00')
            
        rate_per_month = book.depreciation_rate / 12 / 100
        # Simplistic calculation: Current NBV * rate * months
        # Note: In reality, this is usually calculated monthly anyway.
        depr = book.current_nbv * rate_per_month * months
        return depr.quantize(Decimal('0.01'))

    def calculate_double_declining(self, book: AssetBook, months=1):
        """2x Straight line rate applied to declining balance."""
        sl_rate = Decimal('100.00') / (book.useful_life_months / 12)
        ddb_rate = sl_rate * 2
        
        # Temp override for calculation
        orig_rate = book.depreciation_rate
        book.depreciation_rate = ddb_rate
        value = self.calculate_declining_balance(book, months)
        return value

    def calculate_units_of_production(self, book: AssetBook, units_produced: Decimal):
        """Depreciation based on usage: (Cost - Salvage) * (Units Produced / Total Expected)."""
        if not book.total_expected_units or book.total_expected_units <= 0:
            return Decimal('0.00')
            
        asset = book.asset
        rate_per_unit = (asset.acquisition_cost - book.salvage_value) / book.total_expected_units
        return (rate_per_unit * units_produced).quantize(Decimal('0.01'))

    @transaction.atomic
    def run_depreciation_for_period(self, asset_ids=None, end_date=None, units_data=None):
        """
        Batch process to calculate and post depreciation for all assets.
        units_data: Optional dict mapping asset_id to units_produced in this period.
        """
        if not end_date:
            end_date = timezone.now().date()
            
        queryset = AssetBook.objects.filter(
            asset__status=FixedAsset.Status.ACTIVE
        ).select_related('asset', 'asset__category')
        
        if asset_ids:
            queryset = queryset.filter(asset_id__in=asset_ids)
            
        results = []
        accounting_service = AccountingService(user=self.user)
        
        for book in queryset:
            # 1. Determine period to depreciate
            last_date = book.last_depreciation_date or (book.asset.acquisition_date - relativedelta(days=1))
            if last_date >= end_date:
                continue
                
            # Calculate months delta
            delta = relativedelta(end_date, last_date)
            months = delta.years * 12 + delta.months
            
            if months <= 0:
                continue
                
            # 2. Calculate amount
            amount = Decimal('0.00')
            if book.method == AssetBook.DeprMethod.STRAIGHT_LINE:
                amount = self.calculate_straight_line(book, months)
            elif book.method == AssetBook.DeprMethod.DECLINING_BALANCE:
                amount = self.calculate_declining_balance(book, months)
            elif book.method == AssetBook.DeprMethod.DOUBLE_DECLINING:
                amount = self.calculate_double_declining(book, months)
            elif book.method == AssetBook.DeprMethod.UNITS_OF_PRODUCTION:
                units = Decimal(str(units_data.get(str(book.asset_id), 0))) if units_data else Decimal('0')
                if units <= 0:
                    continue
                amount = self.calculate_units_of_production(book, units)
                # Track units
                book.consumed_units += units
                
            if amount <= 0:
                continue
                
            # Cap at NBV (can't depreciate below salvage value)
            max_depr = book.current_nbv - book.salvage_value
            if amount > max_depr:
                amount = max_depr
                
            if amount <= 0:
                continue

            # 3. Create GL Entry (statutory book only; memo books just track NBV)
            from apps.finance.services.accounting import PostingData
            category = book.asset.category
            entry = None
            if book.posts_to_gl:
                entry = self._post_depreciation(accounting_service, PostingData, book, category, amount, end_date)

            # 4. Update Book
            book.current_nbv -= amount
            book.accumulated_depreciation += amount
            book.last_depreciation_date = end_date
            book.save()

            # 5. Record FA Transaction
            AssetTransaction.objects.create(
                asset=book.asset,
                book_type=book.book_type,
                transaction_date=end_date,
                amount=amount,
                transaction_type=AssetTransaction.TransType.DEPRECIATION,
                journal_entry=entry,
                created_by=self.user
            )

            results.append({
                'asset_code': book.asset.code,
                'book_type': book.book_type,
                'amount': amount,
                'status': 'Posted' if entry else 'Recorded (memo book)'
            })

        return results

    @staticmethod
    def _post_depreciation(accounting_service, PostingData, book, category, amount, end_date):
        posting = PostingData(
            description=f"Auto-depreciation for {book.asset.name}",
            entry_date=end_date,
            source_module='fixed_assets',
            source_id=book.id,
            source_reference=f"DEPR-{book.asset.code}-{end_date.strftime('%Y%m')}"
        )
        posting.add_debit(
            category.depr_expense_account.code,
            amount,
            f"Depreciation for {book.asset.name} ({book.book_type})"
        )
        posting.add_credit(
            category.accum_depr_account.code,
            amount,
            f"Accumulated Depreciation for {book.asset.name}"
        )
        return accounting_service.post_entry(posting, journal_code='GJ')

    @transaction.atomic
    def post_asset_disposal(self, asset_id, disposal_date, net_proceeds, notes=""):
        """
        Process asset disposal and generate accounting entries.
        1. Calculate NBV as of disposal date.
        2. Recognize proceeds.
        3. Remove asset cost and accumulated depreciation from books.
        4. Recognize Gain/Loss.
        """
        from apps.finance.services.accounting import PostingData
        
        asset = FixedAsset.objects.get(id=asset_id)
        if asset.status == FixedAsset.Status.DISPOSED:
            raise ValueError("Asset is already disposed.")
            
        category = asset.category
        accounting_service = AccountingService(user=self.user)
        
        # The GL is driven by the book that posts (normally 'Statutory').
        book = asset.books.filter(posts_to_gl=True).order_by('created_at').first()
        if book is None:
            raise ValueError("Asset has no book that posts to the GL.")
        
        # Calculate final Gain/Loss
        # Gain/Loss = Proceeds - (Cost - AccDepr)
        #           = Proceeds - NBV
        gain_loss = net_proceeds - book.current_nbv
        
        posting = PostingData(
            description=f"Disposal of Asset: {asset.name}",
            entry_date=disposal_date,
            source_module='fixed_assets',
            source_id=asset.id,
            source_reference=f"DISP-{asset.code}"
        )
        
        # 1. Recognize Proceeds (Debit Bank/Trust)
        if net_proceeds > 0:
            posting.add_debit(
                accounting_service.ACCOUNTS['BANK_MAIN'], 
                net_proceeds, 
                f"Proceeds from disposal of {asset.code}"
            )
            
        # 2. Clear Accumulated Depreciation (Debit Accum. Depr)
        if book.accumulated_depreciation > 0:
            posting.add_debit(
                category.accum_depr_account.code,
                book.accumulated_depreciation,
                f"Clear accumulated depreciation for {asset.code}"
            )
            
        # 3. Clear Asset Cost (Credit Asset Account)
        posting.add_credit(
            category.asset_cost_account.code,
            asset.acquisition_cost,
            f"Remove asset cost for {asset.code}"
        )
        
        # 4. Record Gain/Loss
        if gain_loss != 0:
            if gain_loss > 0:
                # Gain is a credit (Revenue-like)
                posting.add_credit(
                    category.disposal_gain_loss_account.code,
                    abs(gain_loss),
                    f"Gain on disposal of {asset.code}"
                )
            else:
                # Loss is a debit (Expense-like)
                posting.add_debit(
                    category.disposal_gain_loss_account.code,
                    abs(gain_loss),
                    f"Loss on disposal of {asset.code}"
                )
        
        entry = accounting_service.post_entry(posting, journal_code='GJ')
        
        # Record Transaction
        AssetTransaction.objects.create(
            asset=asset,
            book_type='Statutory',
            transaction_date=disposal_date,
            amount=net_proceeds,
            transaction_type=AssetTransaction.TransType.DISPOSAL,
            journal_entry=entry,
            notes=notes,
            created_by=self.user
        )
        
        # Update Asset and Book
        asset.status = FixedAsset.Status.DISPOSED
        asset.save()
        
        book.current_nbv = Decimal('0.00')
        book.save()
        
        return {
            'asset_code': asset.code,
            'gain_loss': gain_loss,
            'journal_entry': entry.reference
        }
