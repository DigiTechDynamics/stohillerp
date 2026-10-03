"""
When a record may be edited or deleted.

Reference data (customers, accounts, cost centres...) can be changed freely
and deleted while nothing uses it; deleting something in use is refused by
the database and reported as a 400 (see utils/exceptions.py).

Transactions can be changed only while they are drafts. Once they reach the
ledger they are corrected the accounting way - a reversal, credit note,
refund or cancellation - never edited or deleted, so the books keep their
audit trail.

RecordRulesMixin enforces the rules below on update and delete, and adds
`edit_lock` / `delete_lock` to every record the viewset returns: null when
the action is allowed, otherwise the reason it isn't, which the UI shows.
Put the mixin first in a viewset's bases.
"""

from rest_framework.exceptions import ValidationError


def _flag(obj, name, query):
    """A fact a list loaded for every row at once (LIST_ANNOTATIONS), else one query."""
    return getattr(obj, name) if hasattr(obj, name) else query()


def _entries_between(obj):
    from apps.finance.models import JournalEntry

    return JournalEntry.objects.filter(entry_date__range=(obj.start_date, obj.end_date)).exists()


def _status(obj):
    return getattr(obj, 'status', None)


def _not_draft(message):
    return lambda obj: None if _status(obj) == 'draft' else message


def _journal_entry_edit(obj):
    return None if obj.status == 'draft' else 'Posted entries cannot be edited. Reverse the entry instead.'


def _journal_entry_delete(obj):
    return None if obj.status == 'draft' else 'Only draft entries can be deleted. Reverse a posted entry instead.'


def _rental_invoice(obj):
    if obj.is_posted_to_finance or obj.status not in ('draft',):
        return 'Issued rental invoices cannot be changed. Raise a credit note instead.'
    return None


def _lease_edit(obj):
    if obj.status in ('expired', 'terminated', 'renewed'):
        return 'This lease has ended and can no longer be edited.'
    return None


def _lease_delete(obj):
    return None if obj.status == 'draft' else 'Only draft leases can be deleted. Terminate an active lease instead.'


def _maintenance(obj):
    if obj.status in ('completed', 'closed'):
        return 'Completed jobs have bills posted and can no longer be changed.'
    return None


def _payroll_run_edit(obj):
    return None if obj.status in ('draft', 'processing') else 'Approved or paid payroll runs cannot be edited.'


def _payroll_run_delete(obj):
    return None if obj.status == 'draft' else 'Only draft payroll runs can be deleted.'


def _payslip(obj):
    if obj.payroll_run.status in ('approved', 'paid'):
        return 'Payslips of an approved or paid run cannot be changed.'
    return None


def _sale_edit(obj):
    return 'This sale is posted to finance and can no longer be edited.' if obj.is_posted_to_finance else None


def _sale_delete(obj):
    if obj.is_posted_to_finance or obj.status == 'registered':
        return 'Posted or registered sales cannot be deleted. Cancel the sale instead.'
    return None


def _commission(obj):
    if obj.status in ('approved', 'paid'):
        return 'Approved or paid commissions cannot be changed.'
    return None


def _asset_edit(obj):
    return 'Disposed assets cannot be edited.' if obj.status in ('disposed', 'scrapped') else None


def _asset_delete(obj):
    if _flag(obj, '_has_transactions', lambda: obj.transactions.exists()):
        return 'This asset has depreciation or disposal history and cannot be deleted. Dispose of it instead.'
    return None


def _statement_delete(obj):
    if _flag(obj, '_has_reconciled', lambda: obj.lines.filter(is_reconciled=True).exists()):
        return 'Some lines of this statement are reconciled. Undo those matches first.'
    return None


def _statement_line(obj):
    return 'Reconciled lines cannot be changed. Undo the match first.' if obj.is_reconciled else None


def _project_delete(obj):
    from apps.projects.services import wip_balance

    if obj.status not in ('planning',) or _flag(obj, '_has_pos', lambda: obj.purchase_orders.exists()) \
            or wip_balance(obj):
        return 'Projects with costs or purchase orders cannot be deleted. Mark the project cancelled instead.'
    return None


def _account_delete(obj):
    if obj.is_system:
        return 'System accounts cannot be deleted.'
    if _flag(obj, '_has_postings', lambda: obj.journal_lines.exists()):
        return 'This account has postings and cannot be deleted. Deactivate it instead.'
    return None


def _user_delete(obj):
    return 'Users are deactivated, not deleted, so the audit trail keeps their name.'


def _role_delete(obj):
    in_use = _flag(obj, '_in_use', lambda: obj.users.exists())
    return 'Users have this role. Move them to another role first.' if in_use else None


def _currency_delete(obj):
    return 'The base (reporting) currency cannot be deleted.' if obj.is_base else None


def _period_edit(obj):
    return 'Closed periods cannot be edited. Reopen the period first.' if obj.status == 'closed' else None


def _period_delete(obj):
    if _flag(obj, '_has_entries', lambda: _entries_between(obj)):
        return 'This period has journal entries and cannot be deleted.'
    return None


def _year_delete(obj):
    if _flag(obj, '_has_entries', lambda: _entries_between(obj)):
        return 'This year has journal entries and cannot be deleted.'
    return None


def _leave(obj):
    if obj.status in ('approved', 'rejected'):
        return 'Decided leave requests cannot be changed. Cancel the request instead.'
    return None


def _rental_payment(obj):
    return 'Recorded payments are posted to the ledger and cannot be changed. Reverse them instead.'


# model label -> (edit rule, delete rule); a rule returns None or the reason.
RULES = {
    'finance.journalentry': (_journal_entry_edit, _journal_entry_delete),
    'finance.journalbatch': (_not_draft('Only draft batches can be changed.'),
                             _not_draft('Only draft batches can be deleted.')),
    'finance.customerinvoice': (_not_draft('Posted invoices cannot be edited. Raise a credit note instead.'),
                                _not_draft('Posted invoices cannot be deleted. Raise a credit note or write the balance off.')),
    'finance.supplierinvoice': (_not_draft('Posted invoices cannot be edited. Raise a credit note instead.'),
                                _not_draft('Posted invoices cannot be deleted. Raise a credit note instead.')),
    'finance.customerreceipt': (_not_draft('Posted receipts cannot be edited. Refund or reallocate instead.'),
                                _not_draft('Posted receipts cannot be deleted. Refund instead.')),
    'finance.supplierpayment': (_not_draft('Posted payments cannot be edited.'),
                                _not_draft('Posted payments cannot be deleted. Record a refund instead.')),
    'finance.chartofaccount': (None, _account_delete),
    'finance.fiscalperiod': (_period_edit, _period_delete),
    'finance.fiscalyear': (None, _year_delete),
    'procurement.purchaseorder': (_not_draft('Only draft purchase orders can be changed.'),
                                  _not_draft('Only draft orders can be deleted. Cancel it instead.')),
    'rentals.rentalinvoice': (_rental_invoice, _rental_invoice),
    'rentals.rentalpayment': (_rental_payment, _rental_payment),
    'rentals.lease': (_lease_edit, _lease_delete),
    'rentals.maintenancerequest': (_maintenance, _maintenance),
    'payroll.payrollrun': (_payroll_run_edit, _payroll_run_delete),
    'payroll.payslip': (_payslip, _payslip),
    'sales.saletransaction': (_sale_edit, _sale_delete),
    'commissions.commissionrecord': (_commission, _commission),
    'fixed_assets.fixedasset': (_asset_edit, _asset_delete),
    'banking.corporatebankstatement': (None, _statement_delete),
    'banking.corporatebankstatementline': (_statement_line, _statement_line),
    'projects.project': (None, _project_delete),
    'core.user': (None, _user_delete),
    'core.role': (None, _role_delete),
    'core.currency': (None, _currency_delete),
    'hr.leaverequest': (_leave, _leave),
}


def _list_annotations(label):
    """
    Exists() subqueries that answer the rules for a whole page in the list
    query, instead of one query per row.
    """
    from django.db.models import Exists, OuterRef

    if label == 'core.role':
        from apps.core.models import User
        return {'_in_use': Exists(User.roles.through.objects.filter(role_id=OuterRef('pk')))}
    if label == 'finance.chartofaccount':
        from apps.finance.models import JournalLine
        return {'_has_postings': Exists(JournalLine.objects.filter(account_id=OuterRef('pk')))}
    if label in ('finance.fiscalperiod', 'finance.fiscalyear'):
        from apps.finance.models import JournalEntry
        return {'_has_entries': Exists(JournalEntry.objects.filter(
            entry_date__gte=OuterRef('start_date'), entry_date__lte=OuterRef('end_date')))}
    if label == 'fixed_assets.fixedasset':
        from apps.fixed_assets.models import AssetTransaction
        return {'_has_transactions': Exists(AssetTransaction.objects.filter(asset_id=OuterRef('pk')))}
    if label == 'banking.corporatebankstatement':
        from apps.banking.models import CorporateBankStatementLine
        return {'_has_reconciled': Exists(CorporateBankStatementLine.objects.filter(
            statement_id=OuterRef('pk'), is_reconciled=True))}
    return {}


def rules_for(model):
    return RULES.get(model._meta.label_lower, (None, None))


def edit_lock(obj):
    rule = rules_for(type(obj))[0]
    return rule(obj) if rule else None


def delete_lock(obj):
    rule = rules_for(type(obj))[1]
    return rule(obj) if rule else None


class RecordRulesMixin:
    """Enforces RULES on update/delete and reports the locks with each record."""

    def perform_update(self, serializer):
        reason = edit_lock(serializer.instance)
        if reason:
            raise ValidationError({'detail': reason})
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        reason = delete_lock(instance)
        if reason:
            raise ValidationError({'detail': reason})
        super().perform_destroy(instance)

    def _annotate(self, items, objects):
        by_id = {str(o.pk): o for o in objects}
        for item in items:
            obj = by_id.get(str(item.get('id'))) if isinstance(item, dict) else None
            if obj is not None:
                item['edit_lock'] = edit_lock(obj)
                item['delete_lock'] = delete_lock(obj)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        data = response.data
        items = data.get('results') if isinstance(data, dict) else data
        if isinstance(items, list) and items:
            ids = [i.get('id') for i in items if isinstance(i, dict) and i.get('id') is not None]
            model = self.get_queryset().model
            objects = model.objects.filter(pk__in=ids).annotate(**_list_annotations(model._meta.label_lower))
            self._annotate(items, objects)
        return response

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        if isinstance(response.data, dict):
            self._annotate([response.data], [self.get_object()])
        return response
