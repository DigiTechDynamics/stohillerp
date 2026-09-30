from decimal import Decimal

from django.db import migrations, models


def cheque_is_current(apps, schema_editor):
    BankAccount = apps.get_model('finance', 'BankAccount')
    BankAccount.objects.filter(account_type='cheque').update(account_type='current')


class Migration(migrations.Migration):
    """First step of merging banking.CorporateBankAccount into finance.BankAccount."""

    dependencies = [
        ('finance', '0017_approvalrule_approvalrecord'),
    ]

    operations = [
        migrations.AddField(
            model_name='bankaccount',
            name='code',
            field=models.CharField(blank=True, help_text='Internal identifier, e.g. FNB-OPER-01', max_length=20,
                                   null=True, unique=True),
        ),
        migrations.AddField(
            model_name='bankaccount',
            name='iban',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='bankaccount',
            name='opening_balance',
            field=models.DecimalField(decimal_places=2, default=Decimal('0.00'),
                                      help_text='Informational; the balance comes from the GL', max_digits=20),
        ),
        migrations.AlterField(
            model_name='bankaccount',
            name='account_type',
            field=models.CharField(choices=[('current', 'Current / Cheque'), ('savings', 'Savings'),
                                            ('credit', 'Credit Card'), ('loan', 'Loan Account'),
                                            ('investment', 'Investment'), ('petty_cash', 'Petty Cash')],
                                   default='current', max_length=20),
        ),
        migrations.RunPython(cheque_is_current, migrations.RunPython.noop),
        migrations.AlterModelOptions(
            name='bankaccount',
            options={'ordering': ['code', 'name']},
        ),
    ]
