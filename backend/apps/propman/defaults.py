"""
Configurable defaults for new properties and leases (UAT HC-14).

Stored in core.SystemConfig and edited under Property settings > Defaults. A
value nobody has set falls back to the environment (DEFAULT_RENT_ESCALATION_RATE,
DEFAULT_MANAGEMENT_FEE_RATE), so the starting values are a deployment choice,
not a constant in the code.

  GET   propman/defaults/
  PATCH propman/defaults/   {"rent_escalation_rate": "6.50", ...}
"""

from decimal import Decimal, InvalidOperation

from django.conf import settings
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

# name -> (SystemConfig key, settings name, label)
DEFAULTS = {
    'rent_escalation_rate': ('rentals.default_escalation_rate', 'DEFAULT_RENT_ESCALATION_RATE',
                             'Annual rent escalation % for new leases'),
    'management_fee_rate': ('properties.default_management_fee_rate', 'DEFAULT_MANAGEMENT_FEE_RATE',
                            'Management fee % of rent for new managed properties'),
}


def get_default(name) -> Decimal:
    from apps.core.models import SystemConfig

    key, setting, _ = DEFAULTS[name]
    stored = SystemConfig.objects.filter(key=key).values_list('value', flat=True).first()
    return Decimal(str(stored if stored is not None else getattr(settings, setting)))


# Model field defaults (callables, so migrations don't freeze a number).
def default_escalation_rate():
    return get_default('rent_escalation_rate')


def default_management_fee_rate():
    return get_default('management_fee_rate')


class DefaultsView(APIView):
    def get(self, request):
        return Response({name: {'value': str(get_default(name)), 'label': label}
                         for name, (_, _, label) in DEFAULTS.items()})

    def patch(self, request):
        from apps.core.models import SystemConfig

        for name, raw in request.data.items():
            if name not in DEFAULTS:
                raise ValidationError({name: 'Unknown setting.'})
            try:
                value = Decimal(str(raw))
            except (InvalidOperation, TypeError):
                raise ValidationError({name: 'Give a number.'})
            if not Decimal('0') <= value <= Decimal('100'):
                raise ValidationError({name: 'Give a percentage between 0 and 100.'})
            key, _, label = DEFAULTS[name]
            SystemConfig.objects.update_or_create(key=key, defaults={
                'value': str(value.quantize(Decimal('0.01'))), 'description': label, 'updated_by': request.user})
        return self.get(request)
