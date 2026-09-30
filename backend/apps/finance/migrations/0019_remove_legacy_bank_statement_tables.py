from django.db import migrations


class Migration(migrations.Migration):
    """Finance-side statement tables, now moved into banking statements (banking.0003-0005)."""

    dependencies = [
        ('finance', '0018_bankaccount_unify'),
        ('banking', '0005_bank_merge_schema'),
    ]

    operations = [
        migrations.DeleteModel(name='BankReconciliation'),
        migrations.DeleteModel(name='BankTransaction'),
    ]
