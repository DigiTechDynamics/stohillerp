"""Tenant portal: invitations, online payments and their receipting."""

import secrets
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMessage
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from apps.core.models import Role, User
from apps.finance.models import BankAccount, CustomerInvoice, CustomerReceipt
from apps.finance.services.accounting import AccountingError, AccountingService
from apps.portal.gateways import GatewayError, get_gateway
from apps.portal.models import OnlinePayment

OPEN = (CustomerInvoice.InvoiceStatus.POSTED, CustomerInvoice.InvoiceStatus.PARTIAL,
        CustomerInvoice.InvoiceStatus.OVERDUE)


# ─── access ──────────────────────────────────────────────────────────────────

PORTAL_KINDS = {
    # kind: (role type, portal name, what they can do)
    'tenant': (Role.RoleType.TENANT, 'tenant portal',
               'view your statement, pay rent online and log maintenance requests'),
    'owner': (Role.RoleType.OWNER, 'owner portal',
              'view your statements, the performance of your properties and approve maintenance quotes'),
    'contractor': (Role.RoleType.CONTRACTOR, 'contractor portal',
                   'see the jobs assigned to you, update their progress and submit quotes'),
}


def _send_activation(user, first_name, kind):
    _role, portal_name, can_do = PORTAL_KINDS[kind]
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.PORTAL_BASE_URL.rstrip('/')}/portal/activate?uid={uid}&token={token}"
    EmailMessage(subject=f"Your {settings.COMPANY_CONFIG['name']} {portal_name}",
                 body=f"Dear {first_name},\n\nYou can now {can_do}. Set your password here:\n\n{link}\n\n"
                      f"The link works once and expires in a few days.\n",
                 to=[user.email]).send()


def _external_user(email, first_name, last_name, existing, link_field, link_value):
    """Find or create the portal login for an email, refusing staff logins and logins owned by someone else."""
    user = existing or User.objects.filter(email__iexact=email).first()
    if user and getattr(user, f'{link_field}_id') not in (None, link_value.pk):
        raise AccountingError('That email address already belongs to another login.')
    if user and not user.is_portal_only and user.roles.exists():
        raise AccountingError('That email belongs to a staff login; use a different address for the portal.')
    if user is None:
        user = User.objects.create_user(email=email, password=secrets.token_urlsafe(24), first_name=first_name,
                                        last_name=last_name, status=User.UserStatus.PENDING,
                                        **{link_field: link_value})
    elif getattr(user, f'{link_field}_id') is None:
        setattr(user, link_field, link_value)
        user.save(update_fields=[link_field])
    return user


@transaction.atomic
def invite(contact, invited_by=None, kind='tenant') -> User:
    """Create (or re-send) a tenant's or owner's portal login and email an activation link."""
    if kind not in ('tenant', 'owner'):
        raise AccountingError('Contacts can be invited as a tenant or an owner.')
    if not contact.email:
        raise AccountingError('The contact needs an email address to use the portal.')
    user = _external_user(contact.email, contact.first_name, contact.last_name,
                          User.objects.filter(contact=contact).first(), 'contact', contact)
    user.roles.add(Role.objects.get(role_type=PORTAL_KINDS[kind][0]))
    _send_activation(user, contact.first_name, kind)
    return user


@transaction.atomic
def invite_supplier(supplier, invited_by=None) -> User:
    """Create (or re-send) a contractor's portal login for a supplier."""
    email = getattr(supplier, 'email', '')
    if not email:
        raise AccountingError('The supplier needs an email address to use the contractor portal.')
    first, _, last = (getattr(supplier, 'contact_person', '') or supplier.name).partition(' ')
    user = _external_user(email, first, last, User.objects.filter(supplier=supplier).first(), 'supplier', supplier)
    user.roles.add(Role.objects.get(role_type=Role.RoleType.CONTRACTOR))
    _send_activation(user, first, 'contractor')
    return user


def activate(uidb64: str, token: str, password: str) -> User:
    from django.contrib.auth.password_validation import validate_password

    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uidb64)))
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        raise AccountingError('This activation link is not valid.')
    if not default_token_generator.check_token(user, token):
        raise AccountingError('This activation link has expired or was already used.')
    validate_password(password, user)
    user.set_password(password)
    user.status = User.UserStatus.ACTIVE
    user.is_active = True
    user.save(update_fields=['password', 'status', 'is_active'])
    return user


def customer_for(contact):
    from apps.rentals.services.finance_sync import RentalFinanceSyncService
    return RentalFinanceSyncService.sync_tenant_to_customer(contact)


def open_invoices(contact):
    return CustomerInvoice.objects.filter(customer__contact_link=contact, status__in=OPEN,
                                          document_type=CustomerInvoice.DocumentType.INVOICE) \
        .order_by('due_date', 'invoice_date')


# ─── payments ────────────────────────────────────────────────────────────────

@transaction.atomic
def start_payment(contact, invoice_ids, return_url, result_url) -> OnlinePayment:
    """Pay the chosen open invoices (full balances) online. All must share one currency."""
    invoices = list(open_invoices(contact).filter(pk__in=invoice_ids))
    if not invoices or len(invoices) != len(set(map(str, invoice_ids))):
        raise AccountingError('Choose one or more of your open invoices to pay.')
    currencies = {inv.currency_id for inv in invoices}
    if len(currencies) > 1:
        raise AccountingError('Pay invoices in different currencies separately.')
    total = sum((inv.balance_due for inv in invoices), Decimal('0'))
    gateway = get_gateway()
    payment = OnlinePayment.objects.create(
        reference=f"OP{timezone.now():%y%m%d}{secrets.token_hex(4).upper()}", contact=contact,
        customer=invoices[0].customer, amount=total, currency=invoices[0].currency, gateway=gateway.name,
        allocations=[{'invoice': str(inv.pk), 'amount': str(inv.balance_due)} for inv in invoices])
    try:
        redirect_url, poll_url, gateway_ref = gateway.initiate(
            payment, f'{return_url.rstrip("/")}/{payment.reference}', result_url, contact.email)
    except GatewayError as e:
        raise AccountingError(str(e))
    payment.redirect_url, payment.poll_url, payment.gateway_reference = redirect_url, poll_url, gateway_ref
    payment.status = OnlinePayment.Status.PENDING
    payment.save(update_fields=['redirect_url', 'poll_url', 'gateway_reference', 'status'])
    return payment


def _bank_account():
    from apps.finance.services.accounting import receiving_bank_account
    try:
        return receiving_bank_account(setting='ONLINE_PAYMENTS_BANK_ACCOUNT')
    except AccountingError:
        raise AccountingError('Set ONLINE_PAYMENTS_BANK_ACCOUNT to the code of the bank account that receives '
                              'online payments.')


@transaction.atomic
def apply_status(payment: OnlinePayment, status: str, raw_status='', gateway_reference='', amount='') -> OnlinePayment:
    """
    Record a gateway status. On 'paid', receipt the money once:
    rent invoices through a RentalPayment (keeps the rental ledger in step),
    anything else as an AR receipt allocated to the invoice.
    """
    payment = OnlinePayment.objects.select_for_update().get(pk=payment.pk)
    payment.gateway_status = raw_status or status
    if gateway_reference:
        payment.gateway_reference = gateway_reference
    if status == 'paid' and amount and Decimal(amount) != payment.amount:
        raise AccountingError(f'Gateway amount {amount} does not match payment {payment.amount}.')
    if status == 'paid' and not payment.receipted:
        _receipt(payment)
        payment.receipted = True
        payment.status = OnlinePayment.Status.PAID
        from apps.notifications.inbox import notify_module
        notify_module('finance_ar', f'Online payment {payment.reference} received',
                      f'{payment.contact} paid {payment.currency.code if payment.currency_id else ""} {payment.amount:,.2f}.',
                      link='/finance/ar', category='online_payment', related=f'online_payment:{payment.pk}')
    elif status == 'failed' and payment.status != OnlinePayment.Status.PAID:
        payment.status = OnlinePayment.Status.FAILED
    payment.save()
    return payment


def _receipt(payment: OnlinePayment):
    from apps.finance.services.settlement import SettlementService
    from apps.rentals.models import RentalInvoice, RentalPayment

    on = timezone.localdate()
    reference = payment.gateway_reference or payment.reference
    other = []
    for row in payment.allocations:
        invoice = CustomerInvoice.objects.get(pk=row['invoice'])
        amount = Decimal(row['amount'])
        rental = None
        if invoice.invoice_number.startswith('AR-RINV-'):
            rental = RentalInvoice.objects.filter(
                invoice_number=invoice.invoice_number[3:].split('-LF')[0]).first()
        if rental is not None:
            RentalPayment.objects.create(invoice=rental, payment_date=on, amount=amount,
                                         payment_method=RentalPayment.PaymentMethod.ONLINE,
                                         reference=f'{reference}-{rental.invoice_number}')
        else:
            other.append((invoice, amount))
    if other:
        receipt = CustomerReceipt.objects.create(
            customer=payment.customer, receipt_date=on, receipt_reference=reference,
            amount=sum(a for _i, a in other), currency=payment.currency, bank_account=_bank_account())
        entry = AccountingService().post_customer_receipt(receipt, allocate=False)
        receipt.status, receipt.journal_entry = CustomerReceipt.ReceiptStatus.POSTED, entry
        receipt.save(update_fields=['status', 'journal_entry'])
        SettlementService().allocate_receipt(receipt, other)
    payment.receipt_reference = reference
