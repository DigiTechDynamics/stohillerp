"""Purchasing (PO -> receipt -> invoice, 3-way match) and development project accounting."""

from decimal import Decimal as D

import pytest

from apps.core.models import Role
from apps.finance.models import ApprovalRule, ChartOfAccount, JournalEntry, Supplier, SupplierInvoice
from apps.finance.services.accounting import AccountingError, AccountingService
from apps.procurement.models import PurchaseOrder
from apps.procurement import services as purchasing
from apps.projects import services as projects
from apps.properties.models import Property, PropertyType
from tests.conftest import OPEN_PERIOD_DATE, _make_user

pytestmark = pytest.mark.django_db

D0 = OPEN_PERIOD_DATE


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name='BuildCo', ap_account=ChartOfAccount.objects.get(code='2010'),
                                   payment_terms_days=30)


def _account(code):
    return str(ChartOfAccount.objects.get(code=code).id)


def _create_po(client, supplier, lines, **extra):
    response = client.post('/api/v1/procurement/orders/', {
        'supplier': str(supplier.id), 'order_date': str(D0), 'lines': lines, **extra}, format='json')
    assert response.status_code == 201, response.data
    return response.data


def _post(invoice):
    """Review then post, as the supplier-invoice endpoints do."""
    invoice.status = SupplierInvoice.InvoiceStatus.REVIEWED
    invoice.save(update_fields=['status'])
    entry = AccountingService().post_supplier_invoice(invoice)
    invoice.status, invoice.journal_entry = SupplierInvoice.InvoiceStatus.POSTED, entry
    invoice.save(update_fields=['status', 'journal_entry'])
    return entry


# ─── purchasing ──────────────────────────────────────────────────────────────

def test_po_to_invoice_happy_path(auth_client, superuser, supplier):
    client = auth_client(superuser)
    po = _create_po(client, supplier, [
        {'description': 'Cement', 'expense_account': _account('5300'), 'quantity': '10', 'unit_price': '12.50'},
        {'description': 'Sand', 'expense_account': _account('5300'), 'quantity': '4', 'unit_price': '30'}])
    assert po['number'].startswith('PO-') and D(po['total_amount']) == D('245.00')
    assert client.post(f'/api/v1/procurement/orders/{po["id"]}/issue/').status_code == 200

    cement, sand = po['lines']
    response = client.post(f'/api/v1/procurement/orders/{po["id"]}/receive/',
                           {'lines': [{'line': cement['id'], 'quantity': '6'}]}, format='json')
    assert response.status_code == 201 and response.data['number'].startswith('GRN-')
    assert PurchaseOrder.objects.get(pk=po['id']).status == 'partially_received'

    response = client.post(f'/api/v1/procurement/orders/{po["id"]}/create_invoice/',
                           {'invoice_number': 'BC-1', 'invoice_date': str(D0)}, format='json')
    assert response.status_code == 201, response.data
    invoice = SupplierInvoice.objects.get(pk=response.data['id'])
    assert [(ln.description, ln.quantity) for ln in invoice.lines.all()] == [('Cement', D('6.00'))]
    assert invoice.total_amount == D('75.00')
    # The same received goods can't be invoiced twice.
    assert client.post(f'/api/v1/procurement/orders/{po["id"]}/create_invoice/',
                       {'invoice_number': 'BC-2'}, format='json').status_code == 400

    _post(invoice)
    order = PurchaseOrder.objects.get(pk=po['id'])
    assert order.lines.get(description='Cement').invoiced_qty == D('6')
    assert client.get(f'/api/v1/finance/supplier-invoices/{invoice.id}/match_status/').data['status'] == 'matched'

    client.post(f'/api/v1/procurement/orders/{po["id"]}/receive/', {'lines': [
        {'line': cement['id'], 'quantity': '4'}, {'line': sand['id'], 'quantity': '4'}]}, format='json')
    invoice2 = purchasing.create_invoice(order, 'BC-3', D0)
    _post(invoice2)
    assert PurchaseOrder.objects.get(pk=po['id']).status == 'closed'


def test_over_receipt_refused(auth_client, superuser, supplier):
    client = auth_client(superuser)
    po = _create_po(client, supplier, [{'description': 'Tiles', 'expense_account': _account('5300'),
                                        'quantity': '2', 'unit_price': '10'}])
    client.post(f'/api/v1/procurement/orders/{po["id"]}/issue/')
    response = client.post(f'/api/v1/procurement/orders/{po["id"]}/receive/',
                           {'lines': [{'line': po['lines'][0]['id'], 'quantity': '3'}]}, format='json')
    assert response.status_code == 400 and 'exceed' in str(response.data)


def test_po_approval_required_before_issue(auth_client, supplier):
    ApprovalRule.objects.create(name='POs over 100', document_type='purchase_order', min_amount=D('100'),
                                role=Role.objects.get(role_type='finance_manager'))
    buyer = _make_user('buyer@test.local', role_type='finance_manager')
    approver = _make_user('approver@test.local', role_type='finance_manager')
    po = _create_po(auth_client(buyer), supplier, [{'description': 'Roofing', 'expense_account': _account('5300'),
                                                    'quantity': '1', 'unit_price': '500'}])
    assert auth_client(buyer).post(f'/api/v1/procurement/orders/{po["id"]}/issue/').status_code == 400
    assert auth_client(buyer).post(f'/api/v1/procurement/orders/{po["id"]}/approve/').status_code == 400
    assert auth_client(approver).post(f'/api/v1/procurement/orders/{po["id"]}/approve/').status_code == 200
    assert auth_client(buyer).post(f'/api/v1/procurement/orders/{po["id"]}/issue/').status_code == 200


def test_three_way_match_exceptions_block_posting_until_overridden(auth_client, superuser, supplier):
    clerk = _make_user('clerk@test.local', role_type='finance_manager')
    order = PurchaseOrder.objects.create(supplier=supplier, order_date=D0, created_by=superuser)
    line = order.lines.create(description='Paint', expense_account=ChartOfAccount.objects.get(code='5300'),
                              quantity=D('5'), unit_price=D('20'))
    purchasing.issue(order)
    purchasing.receive(order, [(line, D('5'))], D0)
    invoice = purchasing.create_invoice(order, 'P-9', D0, user=clerk)
    inv_line = invoice.lines.get()
    inv_line.unit_price = D('25')            # 25% over the PO price
    inv_line.line_total = D('125')
    inv_line.save()
    invoice.total_amount = invoice.subtotal = D('125')
    invoice.save()

    with pytest.raises(AccountingError, match='3-way match failed'):
        _post(invoice)
    # The creator can't override their own invoice; someone else can, with a reason.
    assert auth_client(clerk).post(f'/api/v1/finance/supplier-invoices/{invoice.id}/override_match/',
                                   {'reason': 'x'}).status_code == 400
    response = auth_client(superuser).post(f'/api/v1/finance/supplier-invoices/{invoice.id}/override_match/',
                                           {'reason': 'Price rise agreed by phone'})
    assert response.status_code == 200 and response.data['status'] == 'overridden'
    invoice.refresh_from_db()
    _post(invoice)


def test_invoicing_more_than_received_is_an_exception(supplier, superuser):
    from apps.finance.models import SupplierInvoiceLine

    order = PurchaseOrder.objects.create(supplier=supplier, order_date=D0)
    line = order.lines.create(description='Pipes', expense_account=ChartOfAccount.objects.get(code='5300'),
                              quantity=D('10'), unit_price=D('3'))
    purchasing.issue(order)
    purchasing.receive(order, [(line, D('2'))], D0)
    invoice = SupplierInvoice.objects.create(supplier=supplier, invoice_number='P-10', invoice_date=D0, due_date=D0,
                                             subtotal=D('30'), total_amount=D('30'))
    SupplierInvoiceLine.objects.create(invoice=invoice, po_line=line, description='Pipes', quantity=D('10'),
                                       unit_price=D('3'), line_total=D('30'),
                                       expense_account=ChartOfAccount.objects.get(code='5300'))
    result = purchasing.match(invoice)
    assert result['status'] == 'exceptions' and 'only 2.00 received' in result['exceptions'][0]


# ─── projects ────────────────────────────────────────────────────────────────

@pytest.fixture
def stand(db):
    return Property.objects.create(name='Stand 42', property_type=PropertyType.objects.first(),
                                   address_line1='Stand 42', purchase_price=D('20000'))


def test_project_costs_flow_to_wip_and_capitalise_to_inventory(auth_client, superuser, supplier, stand):
    client = auth_client(superuser)
    response = client.post('/api/v1/projects/', {'code': 'PRJ-42', 'name': 'Townhouses on stand 42',
                                                  'property': str(stand.id), 'budget': '50000'})
    assert response.status_code == 201, response.data
    project_id = response.data['id']
    assert response.data['cost_center_code'] == 'PRJ-42' and response.data['wip_account_code'] == '1540'

    po = _create_po(client, supplier, [{'description': 'Bricks', 'expense_account': _account('1540'),
                                        'quantity': '1000', 'unit_price': '3'}], project=project_id)
    client.post(f'/api/v1/procurement/orders/{po["id"]}/issue/')
    client.post(f'/api/v1/procurement/orders/{po["id"]}/receive/',
                {'lines': [{'line': po['lines'][0]['id'], 'quantity': '1000'}]}, format='json')
    invoice = SupplierInvoice.objects.get(pk=client.post(f'/api/v1/procurement/orders/{po["id"]}/create_invoice/',
                                                         {'invoice_number': 'BR-1', 'invoice_date': str(D0)},
                                                         format='json').data['id'])
    assert invoice.lines.get().cost_center.code == 'PRJ-42' and invoice.lines.get().property_ref == stand
    _post(invoice)

    report = client.get(f'/api/v1/projects/{project_id}/cost_report/').data
    assert D(report['cost_to_date']) == D('3000.00') and D(report['wip_balance']) == D('3000.00')
    assert D(report['remaining_budget']) == D('47000.00')

    response = client.post(f'/api/v1/projects/{project_id}/capitalise/', {'date': str(D0)})
    assert response.status_code == 201, response.data
    entry = JournalEntry.objects.get(reference=response.data['journal_entry'])
    assert entry.lines.get(side='debit').account.code == '1510'
    stand.refresh_from_db()
    assert stand.purchase_price == D('23000.00')   # sale will book the development cost
    report = client.get(f'/api/v1/projects/{project_id}/cost_report/').data
    assert D(report['wip_balance']) == 0 and D(report['capitalised']) == D('3000.00')
    assert client.get(f'/api/v1/projects/{project_id}/').data['status'] == 'completed'


def test_capitalise_to_fixed_asset(superuser, stand):
    from apps.finance.services.accounting import PostingData
    from apps.fixed_assets.models import AssetCategory

    project = projects.create_project(code='PRJ-HQ', name='Office fit-out', property=stand,
                                      capitalise_to='fixed_asset')
    posting = PostingData(description='Contractor', entry_date=D0)
    posting.add_debit('1540', D('9000'), cost_center=project.cost_center)
    posting.add_credit('1010', D('9000'))
    AccountingService().post_entry(posting)
    acct = {c: ChartOfAccount.objects.get(code=c) for c in ('1520', '1590', '5700', '4900')}
    category = AssetCategory.objects.create(code='BLD', name='Buildings', asset_cost_account=acct['1520'],
                                            accum_depr_account=acct['1590'], depr_expense_account=acct['5700'],
                                            disposal_gain_loss_account=acct['4900'])
    with pytest.raises(AccountingError, match='useful life'):
        projects.capitalise(project, D0, asset_category=category)
    record = projects.capitalise(project, D0, amount=D('4000'), asset_category=category, useful_life_months=240)
    assert record.fixed_asset.acquisition_cost == D('4000') and record.fixed_asset.books.get().current_nbv == D('4000')
    assert projects.wip_balance(project) == D('5000')
    with pytest.raises(AccountingError, match='between 0'):
        projects.capitalise(project, D0, amount=D('6000'), asset_category=category, useful_life_months=240)
