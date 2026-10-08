"""
UAT round 3: tenants list, lease activation on signing, property owners,
purchasing access and invoicing, and fixed assets created from purchasing.
"""

from decimal import Decimal as D

import pytest

from apps.crm.models import Contact
from apps.finance.models import ChartOfAccount, Supplier, SupplierInvoice
from apps.fixed_assets.models import AssetCategory, AssetTransaction, FixedAsset
from apps.procurement import services as purchasing
from apps.procurement.models import PurchaseOrder
from apps.properties.models import Property, PropertyOwnership, PropertyType, PropertyUnit
from apps.propman.services.lettings import mark_signed
from apps.rentals.models import Lease
from tests.conftest import OPEN_PERIOD_DATE, _make_user
from tests.test_gap_closure import bank_account, lease_factory  # noqa: F401  (fixtures)
from tests.test_procurement_projects import _post

pytestmark = pytest.mark.django_db

D0 = OPEN_PERIOD_DATE


def _contact(first, last, contact_type='lead'):
    return Contact.objects.create(first_name=first, last_name=last, contact_type=contact_type)


def _property(name='Unit block'):
    return Property.objects.create(name=name, property_type=PropertyType.objects.first(), address_line1='1 Road')


# ─── Tenants list ───────────────────────────────────────────────────────────

def test_tenants_list_includes_lease_holders_whatever_their_type(auth_client, superuser):
    filed = _contact('Filed', 'Tenant', 'tenant')
    holder = _contact('Lead', 'WithLease', 'lead')
    _contact('Just', 'Lead', 'lead')
    Lease.objects.create(property=_property(), tenant=holder, status=Lease.LeaseStatus.DRAFT,
                         start_date=D0, monthly_rental=D('500'))

    rows = auth_client(superuser).get('/api/v1/crm/contacts/', {'tenants': '1', 'page_size': 100}).data['results']
    names = {r['last_name'] for r in rows}
    assert {'Tenant', 'WithLease'} <= names and 'Lead' not in names
    assert len(rows) == len(names)   # no duplicates from the lease join
    assert filed.pk


# ─── Lease activation ───────────────────────────────────────────────────────

def test_signing_a_lease_activates_it_occupies_the_unit_and_files_the_tenant(lease_factory):
    lease = lease_factory(status=Lease.LeaseStatus.PENDING_SIGNATURE)
    unit = PropertyUnit.objects.create(property=lease.property, unit_number='1A')
    lease.unit = unit
    lease.save()
    Contact.objects.filter(pk=lease.tenant_id).update(contact_type='lead')

    mark_signed(lease, signed=True)
    lease.refresh_from_db()
    unit.refresh_from_db()
    assert lease.status == Lease.LeaseStatus.ACTIVE and lease.signature_status == Lease.SignatureStatus.SIGNED
    assert unit.status == PropertyUnit.UnitStatus.OCCUPIED
    assert Contact.objects.get(pk=lease.tenant_id).contact_type == 'tenant'


def test_declined_lease_goes_back_to_draft(lease_factory):
    lease = lease_factory(status=Lease.LeaseStatus.PENDING_SIGNATURE)
    mark_signed(lease, signed=False)
    lease.refresh_from_db()
    assert lease.status == Lease.LeaseStatus.DRAFT and lease.signature_status == Lease.SignatureStatus.DECLINED


def test_mark_signed_endpoint_returns_an_active_lease(auth_client, superuser, lease_factory):
    lease = lease_factory(status=Lease.LeaseStatus.DRAFT)
    client = auth_client(superuser)
    assert client.post(f'/api/v1/rentals/leases/{lease.id}/mark_signed/', {'signed': True}, format='json').status_code == 200
    assert client.get(f'/api/v1/rentals/leases/{lease.id}/').data['status'] == 'active'


# ─── Property owners ────────────────────────────────────────────────────────

def test_owners_can_be_set_per_property_and_listed(auth_client, superuser):
    client = auth_client(superuser)
    prop = _property('Managed flats')
    landlord = client.post('/api/v1/crm/contacts/', {'first_name': 'Lara', 'last_name': 'Landlord',
                                                     'contact_type': 'landlord'}, format='json').data
    co_owner = _contact('Cody', 'CoOwner', 'lead')
    _contact('Not', 'AnOwner', 'lead')

    response = client.patch(f'/api/v1/properties/{prop.id}/', {'ownership_type': 'managed', 'owner': landlord['id']},
                            format='json')
    assert response.status_code == 200, response.data
    response = client.post('/api/v1/properties/ownerships/', {'property': str(prop.id), 'owner': str(co_owner.id),
                                                              'share_percent': '40'}, format='json')
    assert response.status_code == 201, response.data

    detail = client.get(f'/api/v1/properties/{prop.id}/').data
    assert detail['owner_name'] == 'Lara Landlord' and detail['ownership_type'] == 'managed'
    owners = {r['last_name'] for r in client.get('/api/v1/crm/contacts/', {'owners': '1', 'page_size': 100}).data['results']}
    assert {'Landlord', 'CoOwner'} <= owners and 'AnOwner' not in owners
    assert PropertyOwnership.objects.filter(property=prop).count() == 1


# ─── Purchasing ─────────────────────────────────────────────────────────────

@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name='Furnish Ltd', ap_account=ChartOfAccount.objects.get(code='2010'))


@pytest.fixture
def furniture(db):
    accounts = {code: ChartOfAccount.objects.get(code=code) for code in ('1500', '1550', '5500', '4970')}
    return AssetCategory.objects.create(
        code='FURN-P', name='Furniture', asset_cost_account=accounts['1500'], accum_depr_account=accounts['1550'],
        depr_expense_account=accounts['5500'], disposal_gain_loss_account=accounts['4970'],
        default_useful_life_months=72)


def test_purchasing_users_without_finance_can_raise_an_order(auth_client, supplier, furniture):
    """Rental managers have Purchasing but not AP: they still need suppliers, accounts and categories."""
    client = auth_client(_make_user('rm@test.local', role_type='rental_manager'))
    assert client.get('/api/v1/finance/suppliers/').status_code == 200
    assert client.get('/api/v1/finance/account-search/', {'q': '5'}).status_code == 200
    assert client.get('/api/v1/fixed-assets/categories/').status_code == 200
    response = client.post('/api/v1/procurement/orders/', {
        'supplier': str(supplier.id), 'order_date': str(D0),
        'lines': [{'description': 'Desk', 'asset_category': str(furniture.id), 'quantity': '1', 'unit_price': '300'}],
    }, format='json')
    assert response.status_code == 201, response.data
    # Still no AP rights: posting invoices stays with finance.
    assert client.post('/api/v1/finance/supplier-invoices/', {}, format='json').status_code == 403


def test_order_line_needs_an_account_or_an_asset_category(auth_client, superuser, supplier):
    response = auth_client(superuser).post('/api/v1/procurement/orders/', {
        'supplier': str(supplier.id), 'order_date': str(D0),
        'lines': [{'description': 'Mystery', 'quantity': '1', 'unit_price': '10'}]}, format='json')
    assert response.status_code == 400


def test_bought_assets_join_the_register_when_the_invoice_posts(auth_client, superuser, supplier, furniture):
    client = auth_client(superuser)
    po = client.post('/api/v1/procurement/orders/', {
        'supplier': str(supplier.id), 'order_date': str(D0),
        'lines': [
            {'description': 'Office chair', 'asset_category': str(furniture.id), 'quantity': '4', 'unit_price': '150'},
            {'description': 'Stationery', 'expense_account': str(ChartOfAccount.objects.get(code='5300').id),
             'quantity': '1', 'unit_price': '20'},
        ]}, format='json').data
    chair_line = next(ln for ln in po['lines'] if ln['description'] == 'Office chair')
    assert chair_line['expense_account_code'] == '1500' and chair_line['asset_category_name'] == 'Furniture'

    order = PurchaseOrder.objects.get(pk=po['id'])
    purchasing.issue(order)
    purchasing.receive(order, [(line, line.quantity) for line in order.lines.all()])
    invoice = purchasing.create_invoice(order, 'FUR-77', D0)

    detail = client.get(f'/api/v1/procurement/orders/{order.id}/').data
    assert detail['to_invoice'] is False                       # everything received is on the draft
    assert [i['invoice_number'] for i in detail['invoices']] == ['FUR-77']
    assert not FixedAsset.objects.filter(purchase_invoice_line__invoice=invoice).exists()   # not until posted

    entry = _post(invoice)
    assets = FixedAsset.objects.filter(purchase_invoice_line__invoice=invoice).order_by('code')
    assert assets.count() == 4                                 # one per chair; stationery is an expense
    assert {a.acquisition_cost for a in assets} == {D('150.00')}
    asset = assets.first()
    assert asset.category == furniture and asset.acquisition_date == D0
    book = asset.books.get()
    assert book.useful_life_months == 72 and book.current_nbv == D('150.00')
    acquisition = AssetTransaction.objects.get(asset=asset)
    assert acquisition.transaction_type == 'acquisition' and acquisition.journal_entry == entry

    # The invoice's own entry carried the cost to the asset account; nothing else was posted.
    asset_debit = sum(ln.amount for ln in entry.lines.filter(account__code='1500', side='debit'))
    assert asset_debit == D('600.00')

    # Running the hook again (e.g. a retry) does not duplicate the assets.
    purchasing.create_assets(SupplierInvoice.objects.get(pk=invoice.pk), entry)
    assert FixedAsset.objects.filter(purchase_invoice_line__invoice=invoice).count() == 4


def test_fractional_asset_quantity_becomes_one_asset(superuser, supplier, furniture):
    order = PurchaseOrder.objects.create(supplier=supplier, order_date=D0)
    order.lines.create(description='Carpet (m²)', expense_account=furniture.asset_cost_account,
                       asset_category=furniture, quantity=D('12.5'), unit_price=D('20'))
    purchasing.issue(order)
    purchasing.receive(order, [(line, line.quantity) for line in order.lines.all()])
    _post(purchasing.create_invoice(order, 'CP-1', D0))
    asset = FixedAsset.objects.get(purchase_invoice_line__invoice__invoice_number='CP-1')
    assert asset.acquisition_cost == D('250.00')
