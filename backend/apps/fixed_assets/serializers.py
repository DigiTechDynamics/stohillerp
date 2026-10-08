from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import AssetBook, AssetCategory, AssetLocation, AssetTransaction, FixedAsset


class AssetCategorySerializer(serializers.ModelSerializer):
    asset_cost_account_code = serializers.CharField(source='asset_cost_account.code', read_only=True)
    accum_depr_account_code = serializers.CharField(source='accum_depr_account.code', read_only=True)
    depr_expense_account_code = serializers.CharField(source='depr_expense_account.code', read_only=True)
    disposal_gain_loss_account_code = serializers.CharField(source='disposal_gain_loss_account.code', read_only=True)

    class Meta:
        model = AssetCategory
        fields = '__all__'


class AssetBookSerializer(serializers.ModelSerializer):
    """A depreciation book (statutory, tax, IFRS...). A new book starts at the asset's cost."""
    current_nbv = serializers.DecimalField(max_digits=18, decimal_places=2, required=False)

    class Meta:
        model = AssetBook
        fields = '__all__'
        read_only_fields = ['accumulated_depreciation', 'consumed_units', 'last_depreciation_date']

    def validate(self, attrs):
        asset = attrs.get('asset', getattr(self.instance, 'asset', None))
        if self.instance and self.instance.last_depreciation_date:
            changed = {k for k in ('method', 'useful_life_months', 'salvage_value', 'current_nbv') if k in attrs}
            if changed:
                raise serializers.ValidationError('This book has been depreciated; change it with a revaluation '
                                                  'or impairment instead.')
        if not self.instance and asset is not None and attrs.get('current_nbv') is None:
            attrs['current_nbv'] = asset.acquisition_cost
        if asset is not None and attrs.get('salvage_value') and attrs['salvage_value'] > asset.acquisition_cost:
            raise serializers.ValidationError({'salvage_value': 'The salvage value cannot exceed the cost.'})
        return attrs


class AssetBookInputSerializer(serializers.Serializer):
    """A depreciation book sent with the asset (the form sends the statutory book)."""
    book_type = serializers.CharField(max_length=50, default='Statutory')
    method = serializers.ChoiceField(choices=AssetBook.DeprMethod.choices, default=AssetBook.DeprMethod.STRAIGHT_LINE)
    useful_life_months = serializers.IntegerField(min_value=1)
    salvage_value = serializers.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    depreciation_rate = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    total_expected_units = serializers.DecimalField(max_digits=20, decimal_places=2, required=False, allow_null=True)
    posts_to_gl = serializers.BooleanField(default=True)

    def to_internal_value(self, data):
        # The form sends empty strings for optional numbers it doesn't use.
        data = {key: (None if value == '' else value) for key, value in dict(data).items()}
        return super().to_internal_value(data)


class FixedAssetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    currency_code = serializers.ReadOnlyField(source='currency.code')
    books = AssetBookSerializer(many=True, read_only=True)
    # Written with the asset: creates (or, before any depreciation, updates) its books.
    # Saving an asset used to drop the book silently, so it could never depreciate.
    book_inputs = AssetBookInputSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = FixedAsset
        fields = '__all__'

    def to_internal_value(self, data):
        # The form sends the books as `books`; accept that as the write field.
        if 'books' in data and 'book_inputs' not in data:
            data = {**data, 'book_inputs': data['books']}
        return super().to_internal_value(data)

    def validate(self, attrs):
        cost = attrs.get('acquisition_cost', getattr(self.instance, 'acquisition_cost', None))
        if cost is not None and cost < 0:
            raise serializers.ValidationError({'acquisition_cost': 'The cost cannot be negative.'})
        for book in attrs.get('book_inputs') or []:
            if cost is not None and book['salvage_value'] > cost:
                raise serializers.ValidationError({'books': 'The salvage value cannot exceed the cost.'})
            if book['method'] == AssetBook.DeprMethod.UNITS_OF_PRODUCTION and not book.get('total_expected_units'):
                raise serializers.ValidationError({'books': 'Units of production needs the total expected units.'})
        if not self.instance and not attrs.get('book_inputs'):
            raise serializers.ValidationError({'books': 'Give the depreciation method and useful life.'})
        return attrs

    def _save_books(self, asset, books):
        for book in books:
            existing = asset.books.filter(book_type=book['book_type']).first()
            if existing and (existing.accumulated_depreciation or existing.last_depreciation_date):
                continue   # already depreciated: change it through revaluation or impairment instead
            values = {**book, 'current_nbv': asset.acquisition_cost, 'accumulated_depreciation': Decimal('0.00')}
            if existing:
                for key, value in values.items():
                    setattr(existing, key, value)
                existing.save()
            else:
                AssetBook.objects.create(asset=asset, **values)

    @transaction.atomic
    def create(self, validated_data):
        books = validated_data.pop('book_inputs', [])
        asset = super().create(validated_data)
        self._save_books(asset, books)
        return asset

    @transaction.atomic
    def update(self, instance, validated_data):
        books = validated_data.pop('book_inputs', None)
        asset = super().update(instance, validated_data)
        if books is not None:
            self._save_books(asset, books)
        return asset


class AssetLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetLocation
        fields = '__all__'


class AssetTransactionSerializer(serializers.ModelSerializer):
    asset_code = serializers.CharField(source='asset.code', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    journal_reference = serializers.CharField(source='journal_entry.reference', read_only=True, default=None)

    class Meta:
        model = AssetTransaction
        fields = '__all__'
