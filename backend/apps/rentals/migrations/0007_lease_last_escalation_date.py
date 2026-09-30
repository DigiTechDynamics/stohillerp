from datetime import date

from dateutil.relativedelta import relativedelta
from django.db import migrations, models


def backfill_last_escalation(apps, schema_editor):
    """
    Treat the rent on existing leases as already escalated up to their most
    recent anniversary, so the first billing run doesn't escalate it again
    (rents may have been adjusted by hand before billing existed).
    """
    Lease = apps.get_model('rentals', 'Lease')
    today = date.today()
    for lease in Lease.objects.filter(last_escalation_date__isnull=True):
        years = relativedelta(today, lease.start_date).years
        if years >= 1:
            lease.last_escalation_date = lease.start_date + relativedelta(years=years)
            lease.save(update_fields=['last_escalation_date'])


class Migration(migrations.Migration):

    dependencies = [
        ('rentals', '0006_rentalpayment_amount_from_balance_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='lease',
            name='last_escalation_date',
            field=models.DateField(blank=True, help_text='Anniversary at which the escalation was last applied (set by billing)', null=True),
        ),
        migrations.RunPython(backfill_last_escalation, migrations.RunPython.noop),
    ]
