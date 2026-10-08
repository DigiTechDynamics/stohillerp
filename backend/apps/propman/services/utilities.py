"""
Utility metering: readings, consumption, recharges on the rent invoice and
bulk-meter reconciliation.

A reading's consumption is (reading - previous reading) x the meter's
multiplier. Consumption not yet billed is charged on the next rental invoice
of the lease occupying the meter's unit, at the meter's tariff, together
with the tariff's fixed monthly charge.
"""

from decimal import Decimal

from django.db.models import Sum

from apps.finance.services.accounting import AccountingError, system_account_code
from apps.propman.models import Meter, MeterReading

ZERO = Decimal('0')


def record_reading(meter: Meter, reading_date, reading, is_estimate=False, notes='', user=None) -> MeterReading:
    reading = Decimal(str(reading))
    previous = meter.readings.filter(reading_date__lt=reading_date).order_by('-reading_date').first()
    later = meter.readings.filter(reading_date__gt=reading_date).order_by('reading_date').first()
    if later and later.billed_invoice_id:
        raise AccountingError('A later reading has already been billed; this reading cannot be inserted before it.')
    if previous and reading < previous.reading:
        raise AccountingError(f'The reading is lower than the previous one ({previous.reading} on '
                              f'{previous.reading_date}). If the meter was replaced, add a new meter.')
    if later and reading > later.reading:
        raise AccountingError(f'The reading is higher than the next one ({later.reading} on {later.reading_date}).')
    consumption = ((reading - previous.reading) * meter.multiplier) if previous else ZERO
    obj, _ = MeterReading.objects.update_or_create(
        meter=meter, reading_date=reading_date,
        defaults={'reading': reading, 'is_estimate': is_estimate, 'consumption': consumption, 'notes': notes,
                  'captured_by': user})
    if later:    # its consumption is now measured from this reading
        later.consumption = (later.reading - reading) * meter.multiplier
        later.save(update_fields=['consumption'])
    return obj


def utility_charge_lines(lease, period_start, period_end, vat_rate):
    """
    (lines, readings) for the invoice: consumption since the last billed
    reading up to period_end, plus each tariff's fixed charge. `readings` are
    marked billed by the caller once the invoice exists.
    """
    if not lease.unit_id:
        return [], []
    lines, billed = [], []
    meters = Meter.objects.filter(unit_id=lease.unit_id, is_active=True, tariff__isnull=False) \
        .select_related('tariff', 'tariff__income_account')
    for meter in meters:
        tariff = meter.tariff
        readings = list(meter.readings.filter(billed_invoice__isnull=True, reading_date__lte=period_end,
                                              consumption__gt=0).order_by('reading_date'))
        consumption = sum((r.consumption for r in readings), ZERO)
        amount = tariff.charge_for(consumption) + (tariff.fixed_monthly or ZERO)
        if amount <= 0:
            continue
        vat = (amount * vat_rate).quantize(Decimal('0.01')) if tariff.vat_applicable else Decimal('0.00')
        detail = f'{consumption.normalize():f} {tariff.unit_label}' if consumption else 'fixed charge'
        lines.append({'description': f'{meter.get_utility_display()} {meter.serial_number} ({detail})',
                      'account_code': tariff.income_account.code if tariff.income_account_id else system_account_code('RECOVERIES_INCOME'),
                      'amount': str(amount), 'vat': str(vat), 'source': f'meter:{meter.pk}'})
        billed.extend(readings)
    return lines, billed


def bulk_reconciliation(bulk_meter: Meter, date_from, date_to) -> dict:
    """Bulk (supply) consumption vs. the sum of its sub-meters: the difference is common-area use or loss."""
    def used(meter):
        return meter.readings.filter(reading_date__range=(date_from, date_to)) \
            .aggregate(t=Sum('consumption'))['t'] or ZERO

    bulk = used(bulk_meter)
    subs = [{'meter': m.serial_number, 'unit': m.unit.unit_number if m.unit_id else None,
             'consumption': str(used(m))} for m in bulk_meter.sub_meters.select_related('unit')]
    sub_total = sum((Decimal(s['consumption']) for s in subs), ZERO)
    difference = bulk - sub_total
    return {'bulk_meter': bulk_meter.serial_number, 'utility': bulk_meter.utility,
            'from': str(date_from), 'to': str(date_to), 'bulk_consumption': str(bulk),
            'sub_meter_total': str(sub_total), 'difference': str(difference),
            'loss_percent': str((difference / bulk * 100).quantize(Decimal('0.1'))) if bulk else None,
            'sub_meters': subs}
