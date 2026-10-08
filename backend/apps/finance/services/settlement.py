"""
AR/AP settlement: apply receipts, payments and credit notes to invoices;
write off and refund balances; realise and revalue exchange differences.

Documents are settled in their own (shared) currency. The GL was posted at
each document's own rate, so applying cash booked at one rate to an invoice
booked at another leaves a base-currency residue on the control account; that
residue is the realised exchange difference and is posted here, as BC's
"realised gain/loss" or Odoo's exchange difference entries.

Sign convention: fx_difference on an allocation is from the company's point
of view (positive = gain).
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.finance.models import (
    APAllocation, ARAllocation, ChartOfAccount, CustomerInvoice, CustomerReceipt, JournalEntry, SupplierInvoice,
    SupplierPayment,
)
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData
from apps.finance.services.fx import base_currency, currency_code, get_rate, is_base, to_base

ZERO = Decimal('0.00')
FX_ACCOUNTS = {
    'realised_gain': '4950', 'realised_loss': '5950',
    'unrealised_gain': '4960', 'unrealised_loss': '5960',
}
BAD_DEBTS = '5940'
OTHER_INCOME = '4900'


@dataclass(frozen=True)
class Side:
    """What differs between receivables and payables."""
    name: str
    invoice_model: type
    allocation_model: type
    open_statuses: tuple
    party_field: str
    cash_field: str           # allocation FK to the receipt/payment
    control_normal: str       # 'debit' for AR, 'credit' for AP

    def control_account(self, service, invoice):
        if self.name == 'ar':
            return service.ACCOUNTS['ACCOUNTS_RECEIVABLE']
        supplier = invoice.supplier
        return supplier.ap_account.code if supplier.ap_account else service.ACCOUNTS['ACCOUNTS_PAYABLE']

    def party_refs(self, invoice):
        if self.name == 'ar':
            return {'contact_ref': invoice.customer.contact_link}
        return {'supplier_ref': invoice.supplier}


AR = Side('ar', CustomerInvoice, ARAllocation,
          (CustomerInvoice.InvoiceStatus.POSTED, CustomerInvoice.InvoiceStatus.PARTIAL,
           CustomerInvoice.InvoiceStatus.OVERDUE),
          'customer', 'receipt', 'debit')
AP = Side('ap', SupplierInvoice, APAllocation,
          (SupplierInvoice.InvoiceStatus.POSTED, SupplierInvoice.InvoiceStatus.PARTIAL),
          'supplier', 'payment', 'credit')


def _flip(side):
    return 'credit' if side == 'debit' else 'debit'


class SettlementService:
    def __init__(self, user=None):
        self.user = user
        self.accounting = AccountingService(user=user)

    # ─── public API: cash ────────────────────────────────────────────────────

    @transaction.atomic
    def allocate_receipt(self, receipt: CustomerReceipt, allocations, on: date = None):
        return self._allocate_cash(AR, CustomerReceipt.objects.select_for_update().get(pk=receipt.pk),
                                   allocations, on or receipt.receipt_date)

    @transaction.atomic
    def allocate_payment(self, payment: SupplierPayment, allocations, on: date = None):
        return self._allocate_cash(AP, SupplierPayment.objects.select_for_update().get(pk=payment.pk),
                                   allocations, on or payment.payment_date)

    def auto_allocate_receipt(self, receipt):
        return self.allocate_receipt(receipt, self._fifo(AR, receipt, receipt.customer, receipt.unapplied_amount))

    def auto_allocate_payment(self, payment):
        return self.allocate_payment(payment, self._fifo(AP, payment, payment.supplier, payment.unapplied_amount))

    # ─── public API: credit notes ────────────────────────────────────────────

    @transaction.atomic
    def apply_credit_note(self, credit_note, allocations, on: date = None):
        side = AR if isinstance(credit_note, CustomerInvoice) else AP
        note = side.invoice_model.objects.select_for_update().get(pk=credit_note.pk)
        if not note.is_credit_note:
            raise AccountingError(f'{note.invoice_number} is not a credit note.')
        if note.status not in side.open_statuses:
            raise AccountingError(f'Credit note {note.invoice_number} is not posted or is fully applied.')
        total = self._check_total(allocations, note.balance_due, f'credit note {note.invoice_number}')
        on = on or timezone.localdate()
        rows = [self._apply(side, inv, amount, note, note.exchange_rate, on,
                            ARAllocation.Kind.CREDIT_NOTE, {'credit_note': note})
                for inv, amount in allocations]
        self._consume_document(side, note, total)
        return rows

    # ─── public API: write-off and refund ────────────────────────────────────

    @transaction.atomic
    def write_off(self, invoice, amount: Decimal = None, on: date = None, reason: str = ''):
        """
        AR: Dr Bad Debts / Cr AR.  AP (small balance forgiven): Dr AP / Cr Other Income.
        Posted at the invoice's own rate, so there is no exchange difference.
        """
        side = AR if isinstance(invoice, CustomerInvoice) else AP
        invoice = side.invoice_model.objects.select_for_update().get(pk=invoice.pk)
        amount = Decimal(amount) if amount is not None else invoice.balance_due
        if invoice.is_credit_note or invoice.status not in side.open_statuses:
            raise AccountingError(f'{invoice.invoice_number} has no open balance to write off.')
        if amount <= 0 or amount > invoice.balance_due:
            raise AccountingError(f'Write-off must be between 0 and the open balance {invoice.balance_due}.')
        on = on or timezone.localdate()

        posting = PostingData(
            description=f'Write-off {invoice.invoice_number}' + (f' - {reason}' if reason else ''),
            entry_date=on, source_module=side.name, source_id=invoice.id,
            source_reference=invoice.invoice_number,
            currency_code=currency_code(invoice.currency), exchange_rate=invoice.exchange_rate,
        )
        control = side.control_account(self.accounting, invoice)
        counter = BAD_DEBTS if side is AR else OTHER_INCOME
        posting.add(_flip(side.control_normal), control, amount, 'Balance written off', **side.party_refs(invoice))
        posting.add(side.control_normal, counter, amount, f'Write-off {invoice.invoice_number}')
        entry = self.accounting.post_entry(posting, journal_code='GJ')

        self._settle_invoice(invoice, amount)
        return side.allocation_model.objects.create(
            kind=ARAllocation.Kind.WRITE_OFF, invoice=invoice, allocation_date=on, amount=amount,
            journal_entry=entry, notes=reason[:255], created_by=self.user)

    @transaction.atomic
    def refund(self, source, amount: Decimal, bank_account, on: date = None):
        """
        Pay back (AR) or receive back (AP) unapplied credit: a receipt/payment
        on account or an open credit note. The credit was booked at the
        source's rate and the cash moves at today's rate; the difference is a
        realised exchange difference.
        """
        side, kind_fk = self._source_side(source)
        source = type(source).objects.select_for_update().get(pk=source.pk)
        available = source.unapplied_amount if hasattr(source, 'unapplied_amount') else source.balance_due
        amount = Decimal(amount)
        if amount <= 0 or amount > available:
            raise AccountingError(f'Refund must be between 0 and the unapplied credit {available}.')
        on = on or timezone.localdate()
        currency = source.currency
        booked = to_base(amount, source.exchange_rate)
        cash = to_base(amount, get_rate(currency, on))
        party_doc = source

        posting = self._base_posting(f'Refund of {self._doc_ref(source)}', on, side, source)
        control = self._control_for_party(side, party_doc)
        refs = self._party_refs_for_source(side, party_doc)
        # Clearing the credit moves the control account back towards its normal side.
        posting.add(side.control_normal, control, booked, 'Credit refunded', **refs)
        posting.add(_flip(side.control_normal), bank_account.gl_account.code, cash, 'Refund')
        fx = (cash - booked) if side is AP else (booked - cash)
        self._add_fx(posting, fx, realised=True)
        entry = self.accounting.post_entry(posting, journal_code='GJ')

        self._consume_document(side, source, amount)
        return side.allocation_model.objects.create(
            kind=ARAllocation.Kind.REFUND, allocation_date=on, amount=amount, fx_difference=fx,
            journal_entry=entry, created_by=self.user, **{kind_fk: source})

    # ─── public API: period-end revaluation ──────────────────────────────────

    @transaction.atomic
    def revalue_open_items(self, as_of: date):
        """
        Unrealised exchange differences on open foreign-currency AR/AP items
        (and unapplied foreign receipts/payments) at the as_of rate. Posted as
        one entry that reverses automatically the next day, so realised
        differences at settlement stay measured against the original rate.
        """
        base = base_currency()
        posting = PostingData(description=f'FX revaluation of open items at {as_of}', entry_date=as_of,
                              source_module='fx_revaluation', source_reference=f'FXREV-{as_of}',
                              currency_code=currency_code(base))
        total = ZERO
        detail = []
        for side, docs in self._open_foreign_items(as_of):
            for doc, open_amount, direction in docs:
                rate_now = get_rate(doc.currency, as_of)
                diff = to_base(open_amount, rate_now) - to_base(open_amount, doc.exchange_rate)
                if diff == 0:
                    continue
                # direction +1: asset-like balance (invoice for AR, prepayment for AP)
                # direction -1: liability-like (invoice for AP, unapplied receipt for AR)
                gain = diff * direction
                control = self._control_for_party(side, doc)
                posting.add('debit', control, gain, f'Revalue {self._doc_ref(doc)}',
                            **self._party_refs_for_source(side, doc))
                self._add_fx(posting, gain, realised=False)
                total += gain
                detail.append({'document': self._doc_ref(doc), 'currency': doc.currency.code,
                               'open_amount': str(open_amount), 'difference': str(gain)})
        if not posting.lines:
            return None, detail
        entry = self.accounting.post_entry(posting, journal_code='AJ')
        # Linkage field on a just-posted entry: update() bypasses the immutability guard.
        entry.auto_reverse_date = as_of + timezone.timedelta(days=1)
        JournalEntry.objects.filter(pk=entry.pk).update(auto_reverse_date=entry.auto_reverse_date)
        return entry, detail

    # ─── internals ───────────────────────────────────────────────────────────

    def _allocate_cash(self, side, cash_doc, allocations, on):
        total = self._check_total(allocations, cash_doc.unapplied_amount, self._doc_ref(cash_doc))
        rows = [self._apply(side, inv, amount, cash_doc, cash_doc.exchange_rate, on,
                            ARAllocation.Kind.PAYMENT, {side.cash_field: cash_doc})
                for inv, amount in allocations]
        cash_doc.unapplied_amount -= total
        cash_doc.save(update_fields=['unapplied_amount'])
        return rows

    def _fifo(self, side, cash_doc, party, available):
        from django.db.models import Q

        pairs, remaining = [], available
        if is_base(cash_doc.currency):
            base = base_currency()
            same_currency = Q(currency__isnull=True) | (Q(currency=base) if base else Q())
        else:
            same_currency = Q(currency=cash_doc.currency)
        invoices = side.invoice_model.objects.filter(
            same_currency, **{side.party_field: party}, status__in=side.open_statuses,
            document_type=side.invoice_model.DocumentType.INVOICE,
        ).order_by('due_date', 'invoice_date', 'created_at')
        for inv in invoices:
            if remaining <= 0:
                break
            take = min(remaining, inv.balance_due)
            if take > 0:
                pairs.append((inv, take))
                remaining -= take
        return pairs

    @staticmethod
    def _check_total(allocations, available, label):
        total = sum((Decimal(str(a)) for _inv, a in allocations), ZERO)
        if any(Decimal(str(a)) <= 0 for _inv, a in allocations):
            raise AccountingError('Allocation amounts must be positive.')
        if total > available:
            raise AccountingError(f'Allocations ({total}) exceed what is available on {label} ({available}).')
        return total

    def _apply(self, side, invoice, amount, source, source_rate, on, kind, fk):
        amount = Decimal(str(amount))
        invoice = side.invoice_model.objects.select_for_update().get(pk=invoice.pk)
        if invoice.is_credit_note:
            raise AccountingError(f'{invoice.invoice_number} is a credit note; apply it to an invoice instead.')
        if invoice.status not in side.open_statuses:
            raise AccountingError(f'Invoice {invoice.invoice_number} is not open.')
        if getattr(invoice, side.party_field + '_id') != getattr(source, side.party_field + '_id'):
            raise AccountingError(f'Invoice {invoice.invoice_number} belongs to a different {side.party_field}.')
        if (invoice.currency_id or None) != (source.currency_id or None) and \
                not (is_base(invoice.currency) and is_base(source.currency)):
            raise AccountingError(f'Invoice {invoice.invoice_number} is in a different currency.')
        if amount > invoice.balance_due:
            raise AccountingError(f'{amount} exceeds the open balance of {invoice.invoice_number} '
                                  f'({invoice.balance_due}).')

        # Base value the source cleared vs. what the invoice booked.
        cleared = to_base(amount, source_rate)
        booked = to_base(amount, invoice.exchange_rate)
        fx = (cleared - booked) if side is AR else (booked - cleared)
        entry = None
        if fx != 0:
            posting = self._base_posting(f'Exchange difference {invoice.invoice_number}', on, side, invoice)
            # A gain leaves the control account short on the debit side (AR
            # over-credited, AP under-debited), so debit it; a loss flips it.
            posting.add('debit', side.control_account(self.accounting, invoice),
                        fx, 'Realised exchange difference', **side.party_refs(invoice))
            self._add_fx(posting, fx, realised=True)
            entry = self.accounting.post_entry(posting, journal_code='GJ')

        self._settle_invoice(invoice, amount)
        return side.allocation_model.objects.create(
            kind=kind, invoice=invoice, allocation_date=on, amount=amount, fx_difference=fx,
            journal_entry=entry, created_by=self.user, **fk)

    @staticmethod
    def _settle_invoice(invoice, amount):
        invoice.amount_paid += amount
        paid = invoice.amount_paid >= invoice.total_amount
        invoice.status = invoice.InvoiceStatus.PAID if paid else invoice.InvoiceStatus.PARTIAL
        invoice.save(update_fields=['amount_paid', 'status'])

    def _consume_document(self, side, doc, amount):
        if isinstance(doc, side.invoice_model):   # credit note: amount_paid = applied
            self._settle_invoice(doc, amount)
        else:
            doc.unapplied_amount -= amount
            doc.save(update_fields=['unapplied_amount'])

    def _base_posting(self, description, on, side, doc):
        base = base_currency()
        return PostingData(description=description, entry_date=on, source_module=side.name,
                           source_id=doc.pk, source_reference=self._doc_ref(doc),
                           currency_code=currency_code(base))

    @staticmethod
    def _add_fx(posting, gain, realised):
        """Balance a posting whose other lines net to `gain` on the debit side."""
        if gain == 0:
            return
        kind = 'realised' if realised else 'unrealised'
        if gain > 0:
            posting.add_credit(FX_ACCOUNTS[f'{kind}_gain'], gain, f'{kind.title()} exchange gain')
        else:
            posting.add_debit(FX_ACCOUNTS[f'{kind}_loss'], -gain, f'{kind.title()} exchange loss')

    @staticmethod
    def _source_side(source):
        if isinstance(source, CustomerReceipt):
            return AR, 'receipt'
        if isinstance(source, SupplierPayment):
            return AP, 'payment'
        if isinstance(source, CustomerInvoice) and source.is_credit_note:
            return AR, 'credit_note'
        if isinstance(source, SupplierInvoice) and source.is_credit_note:
            return AP, 'credit_note'
        raise AccountingError('Only receipts, payments and credit notes can be refunded.')

    def _control_for_party(self, side, doc):
        if side is AR:
            return self.accounting.ACCOUNTS['ACCOUNTS_RECEIVABLE']
        supplier = doc.supplier
        return supplier.ap_account.code if supplier.ap_account else self.accounting.ACCOUNTS['ACCOUNTS_PAYABLE']

    @staticmethod
    def _party_refs_for_source(side, doc):
        if side is AR:
            return {'contact_ref': doc.customer.contact_link}
        return {'supplier_ref': doc.supplier}

    @staticmethod
    def _doc_ref(doc):
        return getattr(doc, 'invoice_number', None) or getattr(doc, 'receipt_reference', None) \
            or getattr(doc, 'payment_reference', '')

    @staticmethod
    def _open_foreign_items(as_of):
        """(side, [(document, open amount, direction)]) for foreign-currency open items."""
        def foreign(qs):
            base = base_currency()
            return qs.exclude(currency__isnull=True).exclude(currency=base) if base else qs.none()

        ar_items = []
        for inv in foreign(CustomerInvoice.objects.filter(status__in=AR.open_statuses, invoice_date__lte=as_of)):
            ar_items.append((inv, inv.balance_due, -1 if inv.is_credit_note else 1))
        for rec in foreign(CustomerReceipt.objects.filter(unapplied_amount__gt=0, receipt_date__lte=as_of,
                                                          status=CustomerReceipt.ReceiptStatus.POSTED)):
            ar_items.append((rec, rec.unapplied_amount, -1))
        ap_items = []
        for inv in foreign(SupplierInvoice.objects.filter(status__in=AP.open_statuses, invoice_date__lte=as_of)):
            ap_items.append((inv, inv.balance_due, 1 if inv.is_credit_note else -1))
        for pay in foreign(SupplierPayment.objects.filter(unapplied_amount__gt=0, payment_date__lte=as_of,
                                                          status=SupplierPayment.PaymentStatus.POSTED)):
            ap_items.append((pay, pay.unapplied_amount, 1))
        return [(AR, ar_items), (AP, ap_items)]


def ensure_fx_accounts():
    """Guard used by the views: the FX accounts come from the starter chart."""
    missing = [c for c in FX_ACCOUNTS.values() if not ChartOfAccount.objects.filter(code=c).exists()]
    if missing:
        raise AccountingError(f'Exchange difference accounts missing: {", ".join(missing)}. Run bootstrap_system.')
