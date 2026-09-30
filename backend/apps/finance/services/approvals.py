"""
Approval workflow for AP documents (see models/approval.py).

A document needs every active rule whose threshold its base-currency amount
meets, approved in sequence by a user holding the rule's role, never the
document's creator. A rejection blocks posting until the steps are approved
again after it.
"""

from decimal import Decimal

from apps.finance.models import ApprovalRecord, ApprovalRule, SupplierInvoice, SupplierPayment
from apps.finance.services.accounting import AccountingError
from apps.finance.services.fx import get_rate, to_base

DOC_TYPES = {
    SupplierInvoice: ApprovalRule.DocumentType.SUPPLIER_INVOICE,
    SupplierPayment: ApprovalRule.DocumentType.SUPPLIER_PAYMENT,
}


def _doc_type(doc):
    return DOC_TYPES[type(doc)]


def base_amount(doc) -> Decimal:
    amount = doc.total_amount if isinstance(doc, SupplierInvoice) else doc.amount
    on = doc.invoice_date if isinstance(doc, SupplierInvoice) else doc.payment_date
    return to_base(amount, get_rate(doc.currency, on))


def required_rules(doc):
    return list(ApprovalRule.objects.filter(document_type=_doc_type(doc), is_active=True,
                                            min_amount__lte=base_amount(doc)).select_related('role')
                .order_by('sequence', 'min_amount'))


def _records(doc):
    return ApprovalRecord.objects.filter(document_type=_doc_type(doc), object_id=doc.pk).select_related('user', 'rule')


def status(doc) -> dict:
    records = list(_records(doc))
    last_rejection = max((r.created_at for r in records if r.decision == 'rejected'), default=None)
    approved_rules = {r.rule_id for r in records if r.decision == 'approved'
                      and (last_rejection is None or r.created_at > last_rejection)}
    steps = [{'rule_id': rule.id, 'rule': rule.name, 'role': rule.role.name, 'min_amount': str(rule.min_amount),
              'approved': rule.id in approved_rules} for rule in required_rules(doc)]
    return {
        'required': bool(steps),
        'approved': all(s['approved'] for s in steps),
        'rejected': last_rejection is not None and not all(s['approved'] for s in steps),
        'steps': steps,
        'history': [{'user': r.user.full_name, 'decision': r.decision, 'rule': r.rule.name if r.rule else None,
                     'comment': r.comment, 'at': r.created_at.isoformat()} for r in records],
    }


def ensure_approved(doc):
    state = status(doc)
    if not state['approved']:
        pending = ', '.join(s['rule'] for s in state['steps'] if not s['approved'])
        raise AccountingError(f'Approval required before posting: {pending}.')


def _user_has_role(user, role):
    return user.is_superuser or user.roles.filter(pk=role.pk).exists()


def approve(doc, user, comment=''):
    if doc.created_by_id and doc.created_by_id == user.pk:
        raise AccountingError('You created this document, so someone else must approve it.')
    done = {s['rule_id'] for s in status(doc)['steps'] if s['approved']}
    pending = [r for r in required_rules(doc) if r.id not in done]
    if not pending:
        raise AccountingError('Nothing is waiting for approval on this document.')
    step = pending[0]   # steps are approved in sequence
    if not _user_has_role(user, step.role):
        raise AccountingError(f'The next approval step "{step.name}" needs the {step.role.name} role.')
    ApprovalRecord.objects.create(document_type=_doc_type(doc), object_id=doc.pk, rule=step, user=user,
                                  decision=ApprovalRecord.Decision.APPROVED, comment=comment[:500])
    return status(doc)


def reject(doc, user, comment=''):
    if not comment:
        raise AccountingError('Give a reason for the rejection.')
    rules = required_rules(doc)
    if rules and not any(_user_has_role(user, r.role) for r in rules):
        raise AccountingError('Only an approver for this document can reject it.')
    ApprovalRecord.objects.create(document_type=_doc_type(doc), object_id=doc.pk, user=user,
                                  decision=ApprovalRecord.Decision.REJECTED, comment=comment[:500])
    return status(doc)
