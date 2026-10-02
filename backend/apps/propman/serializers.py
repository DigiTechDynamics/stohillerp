from decimal import Decimal

from rest_framework import serializers

from apps.propman.models import (
    ArrearsAction, ArrearsCase, ArrearsStage, CPIIndex, DebitOrderBatch, DebitOrderItem, DebitOrderMandate,
    DepositInterest, EscalationStep, LeaseGuarantee, LeaseOption, MaintenancePlan, MaintenanceQuote, Meter,
    MeterReading, OwnerPaymentRun, RecoveryReconciliation, RecoverySchedule, RecoveryShare, SavedReport,
    TenantApplication, TurnoverReport, UtilityTariff,
)


def _lease_label(lease):
    return f'{lease.lease_number} - {lease.tenant.full_name if lease.tenant_id else "no tenant"}'


class UtilityTariffSerializer(serializers.ModelSerializer):
    income_account_code = serializers.CharField(source='income_account.code', read_only=True, default=None)

    class Meta:
        model = UtilityTariff
        fields = '__all__'

    def validate_steps(self, steps):
        if not isinstance(steps, list):
            raise serializers.ValidationError('Steps must be a list of {"up_to", "rate"}.')
        previous = Decimal('0')
        for i, step in enumerate(steps):
            try:
                Decimal(str(step['rate']))
                up_to = step.get('up_to')
                if up_to not in (None, ''):
                    if Decimal(str(up_to)) <= previous:
                        raise serializers.ValidationError('Step limits must increase.')
                    previous = Decimal(str(up_to))
                elif i != len(steps) - 1:
                    raise serializers.ValidationError('Only the last step can be open-ended.')
            except (KeyError, ArithmeticError, TypeError):
                raise serializers.ValidationError('Each step needs a numeric rate and an up_to limit (last may be empty).')
        return steps


class MeterSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True, default=None)
    tariff_name = serializers.CharField(source='tariff.name', read_only=True, default=None)
    last_reading = serializers.SerializerMethodField()

    class Meta:
        model = Meter
        fields = '__all__'

    def get_last_reading(self, obj):
        r = obj.readings.order_by('-reading_date').first()
        return {'date': r.reading_date, 'reading': str(r.reading), 'billed': bool(r.billed_invoice_id)} if r else None

    def validate(self, attrs):
        prop = attrs.get('property', getattr(self.instance, 'property', None))
        unit = attrs.get('unit', getattr(self.instance, 'unit', None))
        bulk = attrs.get('bulk_meter', getattr(self.instance, 'bulk_meter', None))
        if unit and prop and unit.property_id != prop.pk:
            raise serializers.ValidationError({'unit': 'The unit belongs to a different property.'})
        if bulk and (bulk.unit_id or bulk.property_id != prop.pk):
            raise serializers.ValidationError({'bulk_meter': 'Choose a bulk (property-level) meter of the same property.'})
        return attrs


class MeterReadingSerializer(serializers.ModelSerializer):
    meter_serial = serializers.CharField(source='meter.serial_number', read_only=True)
    billed_invoice_number = serializers.CharField(source='billed_invoice.invoice_number', read_only=True, default=None)

    class Meta:
        model = MeterReading
        fields = ['id', 'meter', 'meter_serial', 'reading_date', 'reading', 'is_estimate', 'consumption',
                  'billed_invoice', 'billed_invoice_number', 'notes', 'created_at']
        read_only_fields = ['consumption', 'billed_invoice']


class RecoveryShareSerializer(serializers.ModelSerializer):
    lease_label = serializers.SerializerMethodField()
    area = serializers.SerializerMethodField()

    class Meta:
        model = RecoveryShare
        fields = ['id', 'schedule', 'lease', 'lease_label', 'percent', 'area']

    def get_lease_label(self, obj):
        return _lease_label(obj.lease)

    def get_area(self, obj):
        return str(obj.lease.unit.floor_size) if obj.lease.unit_id and obj.lease.unit.floor_size else None

    def validate(self, attrs):
        schedule = attrs.get('schedule', getattr(self.instance, 'schedule', None))
        lease = attrs.get('lease', getattr(self.instance, 'lease', None))
        if lease and schedule and lease.property_id != schedule.property_id:
            raise serializers.ValidationError({'lease': 'The lease is on a different property.'})
        if schedule and schedule.basis == RecoverySchedule.Basis.PERCENT and attrs.get('percent') in (None, ''):
            raise serializers.ValidationError({'percent': 'This schedule is apportioned by percentage; give the share.'})
        return attrs


class RecoveryScheduleSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    effective_budget = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    shares = RecoveryShareSerializer(many=True, read_only=True)

    class Meta:
        model = RecoverySchedule
        fields = '__all__'


class RecoveryReconciliationSerializer(serializers.ModelSerializer):
    schedule_name = serializers.CharField(source='schedule.name', read_only=True)

    class Meta:
        model = RecoveryReconciliation
        fields = '__all__'


class EscalationStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = EscalationStep
        fields = '__all__'
        read_only_fields = ['applied_on']

    def validate(self, attrs):
        new_rent, percent = attrs.get('new_rent'), attrs.get('percent')
        if (new_rent is None) == (percent is None):
            raise serializers.ValidationError('Give either a new rent or a percentage increase.')
        return attrs


class CPIIndexSerializer(serializers.ModelSerializer):
    class Meta:
        model = CPIIndex
        fields = '__all__'

    def validate_month(self, value):
        return value.replace(day=1)


class LeaseOptionSerializer(serializers.ModelSerializer):
    lease_label = serializers.SerializerMethodField()

    class Meta:
        model = LeaseOption
        fields = '__all__'
        read_only_fields = ['alerted_on']

    def get_lease_label(self, obj):
        return _lease_label(obj.lease)


class LeaseGuaranteeSerializer(serializers.ModelSerializer):
    lease_label = serializers.SerializerMethodField()

    class Meta:
        model = LeaseGuarantee
        fields = '__all__'

    def get_lease_label(self, obj):
        return _lease_label(obj.lease)


class TurnoverReportSerializer(serializers.ModelSerializer):
    billed_invoice_number = serializers.CharField(source='billed_invoice.invoice_number', read_only=True, default=None)

    class Meta:
        model = TurnoverReport
        fields = '__all__'
        read_only_fields = ['percentage_rent', 'billed_invoice', 'submitted_by']

    def validate(self, attrs):
        if self.instance and self.instance.billed_invoice_id:
            raise serializers.ValidationError('This month has already been billed.')
        lease = attrs.get('lease', getattr(self.instance, 'lease', None))
        if lease and not lease.turnover_rent_percent:
            raise serializers.ValidationError({'lease': 'Set a turnover rent % on the lease first.'})
        if 'month' in attrs:
            attrs['month'] = attrs['month'].replace(day=1)
        return attrs


class ArrearsStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArrearsStage
        fields = '__all__'


class ArrearsActionSerializer(serializers.ModelSerializer):
    stage_name = serializers.CharField(source='stage.name', read_only=True, default=None)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default=None)
    message_statuses = serializers.SerializerMethodField()

    class Meta:
        model = ArrearsAction
        fields = ['id', 'case', 'stage', 'stage_name', 'action', 'description', 'amount_overdue',
                  'message_statuses', 'created_by_name', 'created_at']

    def get_message_statuses(self, obj):
        return [{'channel': m.channel, 'status': m.status, 'recipient': m.recipient} for m in obj.messages.all()]


class ArrearsCaseSerializer(serializers.ModelSerializer):
    lease_number = serializers.CharField(source='lease.lease_number', read_only=True)
    tenant = serializers.CharField(source='lease.tenant.full_name', read_only=True, default=None)
    property_name = serializers.CharField(source='lease.property.name', read_only=True)
    stage_name = serializers.CharField(source='stage.name', read_only=True, default=None)
    days_overdue = serializers.SerializerMethodField()
    actions = ArrearsActionSerializer(many=True, read_only=True)

    class Meta:
        model = ArrearsCase
        fields = '__all__'
        read_only_fields = ['lease', 'status', 'stage', 'amount_overdue', 'oldest_due_date', 'opened_on', 'closed_on',
                            'promise_date', 'promise_amount', 'attorney', 'legal_reference', 'handed_over_on']

    def get_days_overdue(self, obj):
        from django.utils import timezone
        return (timezone.localdate() - obj.oldest_due_date).days if obj.oldest_due_date else 0


class DebitOrderMandateSerializer(serializers.ModelSerializer):
    lease_label = serializers.SerializerMethodField()

    class Meta:
        model = DebitOrderMandate
        fields = '__all__'

    def get_lease_label(self, obj):
        return _lease_label(obj.lease)

    def validate(self, attrs):
        full = attrs.get('collect_full_balance', getattr(self.instance, 'collect_full_balance', True))
        if not full and not attrs.get('fixed_amount', getattr(self.instance, 'fixed_amount', None)):
            raise serializers.ValidationError({'fixed_amount': 'Give the fixed amount to collect.'})
        day = attrs.get('collection_day', getattr(self.instance, 'collection_day', 1))
        if not 1 <= day <= 28:
            raise serializers.ValidationError({'collection_day': 'Choose a day from 1 to 28.'})
        return attrs


class DebitOrderItemSerializer(serializers.ModelSerializer):
    mandate_reference = serializers.CharField(source='mandate.reference', read_only=True)
    lease_label = serializers.SerializerMethodField()

    class Meta:
        model = DebitOrderItem
        fields = ['id', 'mandate', 'mandate_reference', 'lease_label', 'amount', 'status', 'unpaid_reason']

    def get_lease_label(self, obj):
        return _lease_label(obj.mandate.lease)


class DebitOrderBatchSerializer(serializers.ModelSerializer):
    items = DebitOrderItemSerializer(many=True, read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)

    class Meta:
        model = DebitOrderBatch
        fields = ['id', 'number', 'collection_date', 'bank_account', 'bank_account_name', 'status', 'total', 'items',
                  'created_at']
        read_only_fields = ['number', 'status', 'total']


class DepositInterestSerializer(serializers.ModelSerializer):
    lease_number = serializers.CharField(source='lease.lease_number', read_only=True)

    class Meta:
        model = DepositInterest
        fields = ['id', 'lease', 'lease_number', 'month', 'rate', 'amount', 'created_at']


class OwnerPaymentRunSerializer(serializers.ModelSerializer):
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)

    class Meta:
        model = OwnerPaymentRun
        fields = ['id', 'number', 'run_date', 'bank_account', 'bank_account_name', 'total', 'lines', 'created_at']


class TenantApplicationSerializer(serializers.ModelSerializer):
    applicant_name = serializers.CharField(source='applicant.full_name', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True, default=None)
    lease_number = serializers.CharField(source='lease.lease_number', read_only=True, default=None)
    rent_to_income = serializers.DecimalField(max_digits=6, decimal_places=1, read_only=True)

    class Meta:
        model = TenantApplication
        fields = '__all__'
        read_only_fields = ['status', 'credit_status', 'credit_score', 'credit_provider', 'credit_reference',
                            'credit_checked_at', 'credit_notes', 'lease']

    def validate(self, attrs):
        prop = attrs.get('property', getattr(self.instance, 'property', None))
        unit = attrs.get('unit', getattr(self.instance, 'unit', None))
        if unit and prop and unit.property_id != prop.pk:
            raise serializers.ValidationError({'unit': 'The unit belongs to a different property.'})
        return attrs


class MaintenanceQuoteSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    request_reference = serializers.CharField(source='request.reference', read_only=True)
    purchase_order_number = serializers.CharField(source='purchase_order.number', read_only=True, default=None)

    class Meta:
        model = MaintenanceQuote
        fields = '__all__'
        read_only_fields = ['status', 'decided_by', 'decided_at', 'owner_decision_note', 'purchase_order']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('The quote must be greater than zero.')
        return value


class MaintenancePlanSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True)
    contractor_name = serializers.CharField(source='contractor.name', read_only=True, default=None)

    class Meta:
        model = MaintenancePlan
        fields = '__all__'
        read_only_fields = ['last_raised']

    def validate_frequency_months(self, value):
        if value < 1:
            raise serializers.ValidationError('Choose at least every month.')
        return value


class SavedReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedReport
        fields = ['id', 'name', 'report', 'params', 'schedule', 'recipients', 'last_sent_on']
        read_only_fields = ['last_sent_on']

    def validate_report(self, value):
        from apps.propman.services.reports import REPORTS
        if value not in REPORTS:
            raise serializers.ValidationError(f'Unknown report. Choose one of: {", ".join(REPORTS)}.')
        return value
