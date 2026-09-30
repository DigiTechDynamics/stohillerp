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

@transaction.atomic
def invite(contact, invited_by=None) -> User:
    """Create (or re-send) the tenant's portal login and email an activation link."""
    if not contact.email:
        raise AccountingError('The contact needs an email address to use the portal.')
    user = User.objects.filter(contact=contact).first() or User.objects.filter(email__iexact=contact.email).first()
    if user and user.contact_id not in (None, contact.pk):
        raise AccountingError('That email address already belongs to another login.')
    if user and not user.is_portal_only and user.roles.exists():
        raise AccountingError('That email belongs to a staff login; use a different address for the portal.')
    if user is None:
        user = User.objects.create_user(email=contact.email, password=secrets.token_urlsafe(24),
                                        first_name=contact.first_name, last_name=contact.last_name,
                                        status=User.UserStatus.PENDING, contact=contact)
    elif user.contact_id is None:
        user.contact = contact
        user.save(update_fields=['contact'])
    user.roles.add(Role.objects.get(role_type=Role.RoleType.TENANT))

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.PORTAL_BASE_URL.rstrip('/')}/portal/activate?uid={uid}&token={token}"
    EmailMessage(subject=f"Your {settings.COMPANY_CONFIG['name']} tenant portal",
                 body=f"Dear {contact.first_name},\n\nYou can now view your statement, pay rent online and log "
                      f"maintenance requests. Set your password here:\n\n{link}\n\n"
                      f"The link works once and expires in a few days.\n",
                 to=[contact.email]).send()
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
    code = getattr(settings, 'ONLINE_PAYMENTS_BANK_ACCOUNT', '')
    account = BankAccount.objects.filter(code=code).first() if code else None
    account = account or BankAccount.objects.filter(is_active=True).order_by('code').first()
    if account is None:
        raise AccountingError('No bank account is set up to receive online payments.')
    return account


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
