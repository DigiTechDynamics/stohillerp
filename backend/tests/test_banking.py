"""
Unified bank accounts, statement import and reconciliation (banking app on
top of finance.BankAccount).
"""

from datetime import timedelta
from decimal import Decimal as D

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.banking.models import CorporateBankStatementLine, ReconciliationRule
from apps.finance.models import BankAccount, ChartOfAccount
from apps.finance.services.accounting import AccountingService, PostingData
from tests.conftest import OPEN_PERIOD_DATE

pytestmark = pytest.mark.django_db

D0 = OPEN_PERIOD_DATE


@pytest.fixture
def account(db):
    gl = ChartOfAccount.objects.create(code='1040', name='Test bank', account_type='asset', account_sub_type='bank')
    return BankAccount.objects.create(code='TST-01', name='Test', bank_name='Test Bank', account_number='999',
                                      gl_account=gl)


def _post(account, amount, reference, on=D0, counter='4900'):
    posting = PostingData(description=f'Movement {reference}', entry_date=on, source_reference=reference)
    if amount > 0:
        posting.add_debit(account.gl_account.code, amount)
        posting.add_credit(counter, amount)
    else:
        posting.add_debit(counter, -amount)
        posting.add_credit(account.gl_account.code, -amount)
    return AccountingService().post_entry(posting)


def _import(client, account, csv_text, **extra):
    return client.post('/api/v1/banking/statements/import/',
                       {'bank_account': str(account.id), 'file': SimpleUploadedFile('s.csv', csv_text.encode()),
                        **extra}, format='multipart')


def test_banking_and_finance_share_one_account(auth_client, superuser, account):
    client = auth_client(superuser)
    ids = {a['id'] for a in client.get('/api/v1/banking/accounts/', {'page_size': 200}).data['results']}
    assert str(account.id) in ids
    assert client.get(f'/api/v1/finance/bank-accounts/{account.id}/').status_code == 200


def test_statement_import_signed_and_debit_credit_formats(auth_client, superuser, account):
    client = auth_client(superuser)
    response = _import(client, account, 'date,description,reference,amount\n'
                                        f'{D0},Rent,R1,100.00\n{D0},Fee,F1,(12.50)\n', opening_balance='1000')
    assert response.status_code == 201, response.data
    assert response.data['closing_balance'] == '1087.50'
    response = _import(client, account, 'Date,Description,Reference,Debit,Credit\n'
                                        f'{D0.strftime("%d/%m/%Y")},Rent,R1,,100.00\n'
                                        f'{D0.strftime("%d/%m/%Y")},Transfer,T9,40.00,\n')
    assert response.status_code == 201, response.data
    assert response.data['skipped_duplicates'] == 1        # R1 was already imported
    assert [ln['amount'] for ln in response.data['lines']] == ['-40.00']


def test_bad_statement_rows_are_reported(auth_client, superuser, account):
    response = _import(auth_client(superuser), account, 'date,amount\nnot-a-date,5\n')
    assert response.status_code == 400
    assert 'row 2' in str(response.data)


def test_auto_match_respects_side_and_never_reuses_a_ledger_line(auth_client, superuser, account):
    _post(account, D('100'), 'R1')
    _post(account, D('-100'), 'P1')      # same amount, money out
    client = auth_client(superuser)
    statement = _import(client, account, f'date,description,reference,amount\n'
                                         f'{D0},Deposit,R1,100\n{D0},Deposit again,R1b,100\n').data
    result = client.post(f'/api/v1/banking/statements/{statement["id"]}/auto_match/').data
    assert result['matches_found'] == 1
    lines = CorporateBankStatementLine.objects.filter(statement_id=statement['id']).order_by('reference')
    assert lines[0].is_reconciled and lines[0].journal_entry_line.side == 'debit'
    assert not lines[1].is_reconciled     # the only +100 ledger line is taken; -100 is the wrong side


def test_keyword_rule_posts_bank_charges(auth_client, superuser, account):
    ReconciliationRule.objects.create(name='Bank fees', rule_type='keyword_match', match_keyword='service fee',
                                      auto_post=True, target_account=ChartOfAccount.objects.get(code='5920'))
    client = auth_client(superuser)
    statement = _import(client, account, f'date,description,reference,amount\n{D0},Monthly SERVICE FEE,FEE,-7.50\n').data
    result = client.post(f'/api/v1/banking/statements/{statement["id"]}/auto_match/').data
    assert result['adjustments_posted'] == 1
    line = CorporateBankStatementLine.objects.get(statement_id=statement['id'])
    assert line.is_reconciled and line.journal_entry_line.side == 'credit'
    assert account.book_balance() == D('-7.50')


def test_manual_match_validations_and_unmatch(auth_client, superuser, account):
    entry = _post(account, D('55'), 'R5')
    ledger_line = entry.lines.get(account=account.gl_account)
    client = auth_client(superuser)
    statement = _import(client, account, f'date,reference,amount\n{D0},R5,55\n{D0},X,56\n').data
    good, bad = statement['lines'][0], statement['lines'][1]
    assert client.post(f'/api/v1/banking/lines/{bad["id"]}/reconcile_manually/',
                       {'journal_line_id': str(ledger_line.id)}).status_code == 400      # amounts differ
    assert client.post(f'/api/v1/banking/lines/{good["id"]}/reconcile_manually/',
                       {'ledger_line_id': str(ledger_line.id)}).status_code == 200
    unmatched = client.get(f'/api/v1/banking/accounts/{account.id}/unmatched_ledger/').data
    assert str(ledger_line.id) not in {row['id'] for row in unmatched}
    assert client.post(f'/api/v1/banking/lines/{good["id"]}/unreconcile/').status_code == 200
    unmatched = client.get(f'/api/v1/banking/accounts/{account.id}/unmatched_ledger/').data
    assert unmatched[0]['amount'] == '55.00'


def test_reconciliation_report_balances(auth_client, superuser, account):
    client = auth_client(superuser)
    _post(account, D('500'), 'R1', on=D0 - timedelta(days=3))
    _post(account, D('-120'), 'CHQ-9', on=D0 - timedelta(days=2))       # cheque not yet presented
    _post(account, D('80'), 'R2', on=D0 - timedelta(days=1))            # deposit in transit
    statement = _import(client, account, f'date,reference,amount\n{D0 - timedelta(days=3)},R1,500\n'
                                         f'{D0},FEE,-5\n', opening_balance='0').data
    client.post(f'/api/v1/banking/statements/{statement["id"]}/auto_match/')
    report = client.get(f'/api/v1/banking/accounts/{account.id}/reconciliation/', {'as_of': D0}).data
    assert D(report['balance_per_bank']) == D('495')
    assert D(report['deposits_in_transit']) == D('80')
    assert D(report['unpresented_payments']) == D('-120')
    assert D(report['statement_items_not_in_books']) == D('-5')
    assert D(report['balance_per_books']) == D('460')
    assert D(report['difference']) == 0

    fee_line = next(ln for ln in statement['lines'] if ln['reference'] == 'FEE')
    response = client.post(f'/api/v1/banking/lines/{fee_line["id"]}/post_adjustment/', {'account_code': '5920'})
    assert response.status_code == 200, response.data
    stats = client.get(f'/api/v1/banking/accounts/{account.id}/stats/').data
    assert stats['reconciled_lines'] == 2 and stats['reconciliation_health'] == 100.0
