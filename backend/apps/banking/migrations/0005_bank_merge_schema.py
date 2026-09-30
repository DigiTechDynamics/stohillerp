import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    """Schema half of the bank account merge (data moved in 0003)."""

    dependencies = [
        ('banking', '0004_bank_merge_data'),
    ]

    operations = [
        migrations.RemoveField(model_name='corporatebankstatement', name='bank_account_old'),
        migrations.RenameField(model_name='corporatebankstatement', old_name='account', new_name='bank_account'),
        migrations.AlterField(
            model_name='corporatebankstatement', name='bank_account',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='statements',
                                    to='finance.bankaccount'),
        ),
        migrations.AlterField(
            model_name='corporatebankstatementline', name='reference',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AlterField(
            model_name='corporatebankstatementline', name='journal_entry_line',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='bank_statement_lines', to='finance.journalline'),
        ),
        migrations.AlterModelOptions(name='corporatebankstatement',
                                     options={'ordering': ['-statement_date', '-created_at']}),
        migrations.AlterModelOptions(name='corporatebankstatementline',
                                     options={'ordering': ['transaction_date', 'id']}),
        migrations.AddConstraint(
            model_name='corporatebankstatementline',
            constraint=models.UniqueConstraint(condition=Q(journal_entry_line__isnull=False),
                                               fields=('journal_entry_line',),
                                               name='bank_line_matches_one_ledger_line'),
        ),
        migrations.DeleteModel(name='CorporateBankAccount'),
    ]