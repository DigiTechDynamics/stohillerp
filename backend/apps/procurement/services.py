"""
Purchasing workflow and 3-way matching.

  draft PO -> (approval rules) -> issue -> receive (GRN) -> invoice -> post

A supplier invoice line linked to a PO line must agree with:
  * the PO price, within PO_PRICE_TOLERANCE_PCT, and
  * what was received: quantity invoiced so far + this line <= quantity received.
Posting an invoice with exceptions is refused unless someone other than its
creator overrides the match with a reason (recorded on the invoice).
"""

from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.finance.services.accounting import AccountingError
from apps.procurement.models import GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine

CENT = Decimal('0.01')


def _tolerance() -> Decimal:
    return Decimal(str(getattr(settings, 'PO_PRICE_TOLERANCE_PCT', 2)))


@transaction.atomic
def issue(order: PurchaseOrder, user=None) -> PurchaseOrder:
    from apps.finance.services import approvals

    if order.status != PurchaseOrder.Status.DRAFT:
        raise AccountingError('Only draft purchase orders can be issued.')
    if not order.lines.exists():
        raise AccountingError('Add at least one line before issuing the order.')
    approvals.ensure_approved(order)
    order.status = PurchaseOrder.Status.ISSUED
    order.issued_at = timezone.now()
    order.save(update_fields=['status', 'issued_at'])
    return order


@transaction.atomic
def cancel(order: PurchaseOrder) -> PurchaseOrder:
    if order.lines.filter(received_qty__gt=0).exists():
        raise AccountingError('Goods have been received on this order; it can no longer be cancelled.')
    order.status = PurchaseOrder.Status.CANCELLED
    order.save(update_fields=['status'])
    return order


@transaction.atomic
def receive(order: PurchaseOrder, quantities, on=None, delivery_note='', user=None) -> GoodsReceipt:
    """quantities: [(PurchaseOrderLine, qty)] for this delivery."""
    order = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
    if order.status not in (PurchaseOrder.Status.ISSUED, PurchaseOrder.Status.PARTIAL):
        raise AccountingError('Only issued orders can receive goods.')
    receipt = GoodsReceipt.objects.create(order=order, receipt_date=on or timezone.localdate(),
                                          delivery_note=delivery_note, created_by=user)
    for line, qty in quantities:
        qty = Decimal(str(qty))
        line = PurchaseOrderLine.objects.select_for_update().get(pk=line.pk)
        if line.order_id != order.pk:
            raise AccountingError('A receipt line belongs to a different purchase order.')
        if qty <= 0:
            continue
        if line.received_qty + qty > line.quantity:
            raise AccountingError(f'"{line.description}": receiving {qty} would exceed the {line.quantity} ordered '
                                  f'({line.received_qty} already received).')
        GoodsReceiptLine.objects.create(receipt=receipt, order_line=line, quantity=qty)
        line.received_qty += qty
        line.save(update_fields=['received_qty'])
    if not receipt.lines.exists():
        raise AccountingError('Nothing to receive.')
    order.refresh_status()
    return receipt


def _pending_on_other_invoices(line, exclude_invoice=None):
    """Quantity on unposted invoices for this PO line (so it isn't invoiced twice)."""
    from apps.finance.models import SupplierInvoice, SupplierInvoiceLine

    qs = SupplierInvoiceLine.objects.filter(po_line=line, invoice__status__in=[
        SupplierInvoice.InvoiceStatus.DRAFT, SupplierInvoice.InvoiceStatus.REVIEWED])
    if exclude_invoice is not None:
        qs = qs.exclude(invoice=exclude_invoice)
    return sum((ln.quantity for ln in qs), Decimal('0'))


@transaction.atomic
def create_invoice(order: PurchaseOrder, invoice_number: str, invoice_date, user=None):
    """Draft supplier invoice for everything received but not yet invoiced."""
    from apps.finance.models import SupplierInvoice, SupplierInvoiceLine

    if not invoice_number:
        raise AccountingError("Enter the supplier's invoice number.")
    cost_center = order.cost_center or (order.project.cost_center if order.project_id else None)
    property_ref = order.property_ref or (order.project.property if order.project_id else None)
    rows = []
    for line in order.lines.select_related('tax_code', 'expense_account'):
        qty = line.received_qty - line.invoiced_qty - _pending_on_other_invoices(line)
        if qty <= 0:
            continue
        net = (qty * line.unit_price).quantize(CENT)
        tax = (net * line.tax_code.rate / 100).quantize(CENT) if line.tax_code else Decimal('0.00')
        rows.append((line, qty, net, tax))
    if not rows:
        raise AccountingError('Nothing has been received that is not already invoiced.')

    invoice = SupplierInvoice.objects.create(
        supplier=order.supplier, invoice_number=invoice_number, invoice_date=invoice_date,
        due_date=invoice_date + timezone.timedelta(days=order.supplier.payment_terms_days),
        currency=order.currency, reference=order.number,
        subtotal=sum(r[2] for r in rows), tax_total=sum(r[3] for r in rows),
        total_amount=sum(r[2] + r[3] for r in rows), created_by=user)
    for line, qty, net, tax in rows:
        SupplierInvoiceLine.objects.create(
            invoice=invoice, po_line=line, description=line.description, expense_account=line.expense_account,
            quantity=qty, unit_price=line.unit_price, tax_code=line.tax_code, tax_amount=tax,
            line_total=net + tax, cost_center=cost_center, property_ref=property_ref)
    return invoice


def match(invoice) -> dict:
    """3-way match result for a supplier invoice."""
    lines = list(invoice.lines.select_related('po_line__order'))
    po_lines = [ln for ln in lines if ln.po_line_id]
    if not po_lines:
        return {'status': 'not_applicable', 'exceptions': []}
    exceptions = []
    tolerance = _tolerance()
    # Once posted, this invoice's own quantity is already in invoiced_qty.
    posted = invoice.status not in (invoice.InvoiceStatus.DRAFT, invoice.InvoiceStatus.REVIEWED)
    for ln in po_lines:
        po_line = ln.po_line
        if po_line.unit_price and abs(ln.unit_price - po_line.unit_price) / po_line.unit_price * 100 > tolerance:
            exceptions.append(f'{ln.description}: price {ln.unit_price} vs PO {po_line.unit_price} '
                              f'(tolerance {tolerance}%).')
        invoiced_after = po_line.invoiced_qty + (0 if posted else ln.quantity)
        if invoiced_after > po_line.received_qty:
            exceptions.append(f'{ln.description}: invoiced {invoiced_after} but only {po_line.received_qty} '
                              f'received on {po_line.order.number}.')
    if not exceptions:
        status = 'matched'
    elif invoice.match_override_by_id:
        status = 'overridden'
    else:
        status = 'exceptions'
    return {'status': status, 'exceptions': exceptions,
            'override': {'by': invoice.match_override_by.full_name if invoice.match_override_by_id else None,
                         'reason': invoice.match_override_reason}}


def enforce_match(invoice):
    """Called by the posting service before a supplier invoice is posted."""
    result = match(invoice)
    if result['status'] == 'exceptions':
        raise AccountingError('3-way match failed: ' + ' '.join(result['exceptions']) +
                              ' Correct the invoice, receive the goods, or have the match overridden.')


def record_invoiced(invoice):
    """Called after posting: advance invoiced quantities and PO status."""
    orders = set()
    for ln in invoice.lines.filter(po_line__isnull=False).select_related('po_line__order'):
        po_line = PurchaseOrderLine.objects.select_for_update().get(pk=ln.po_line_id)
        po_line.invoiced_qty += ln.quantity
        po_line.save(update_fields=['invoiced_qty'])
        orders.add(po_line.order)
    for order in orders:
        order.refresh_status()


@transaction.atomic
def override_match(invoice, user, reason: str):
    if not reason:
        raise AccountingError('Give a reason for overriding the match.')
    if invoice.created_by_id == user.pk:
        raise AccountingError('You created this invoice, so someone else must override its match.')
    if match(invoice)['status'] != 'exceptions':
        raise AccountingError('This invoice has no match exceptions to override.')
    invoice.match_override_by = user
    invoice.match_override_reason = reason[:500]
    invoice.save(update_fields=['match_override_by', 'match_override_reason'])
    return match(invoice)
