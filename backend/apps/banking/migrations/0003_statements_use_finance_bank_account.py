"""
Merge banking.CorporateBankAccount into finance.BankAccount.

1. Each corporate account is matched to the finance account on the same GL
   account (or one is created from it) and its statements are re-pointed.
2. Finance's separate statement tables (BankTransaction/BankReconciliation)
   are moved into one "legacy import" statement per account, keeping their
   reconciliation to the account's GL line where one can be identified.
3. A ledger line may only be matched to one statement line; duplicate
   matches from before are cleared for re-matching.
4. The merge is three migrations, each its own transaction, because
   PostgreSQL won't alter a table (or build an index) while deferred
   constraint checks from a data step are pending: 0003 prepares the
   columns, 0004 moves the data, 0005 cleans up and drops
   CorporateBankAccount (finance.0019 then drops the old finance tables).
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('banking', '0002_reconciliationrule'),
        ('finance', '0018_bankaccount_unify'),
    ]

    operations = [
        migrations.RenameField(model_name='corporatebankstatement', old_name='bank_account',
                               new_name='bank_account_old'),
        migrations.AlterField(
            model_name='corporatebankstatement', name='bank_account_old',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='+',
                                    to='banking.corporatebankaccount'),
        ),
        migrations.AddField(
            model_name='corporatebankstatement', name='account',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+',
                                    to='finance.bankaccount'),
        ),
    ]
