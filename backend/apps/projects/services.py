"""Project creation, cost reporting and WIP capitalisation."""

from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum

from apps.finance.models import ChartOfAccount, CostCenter, JournalEntry, JournalLine
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData
from apps.projects.models import Project, ProjectCapitalisation

ZERO = Decimal('0.00')
WIP_ACCOUNT = '1540'
INVENTORY_ACCOUNT_KEY = 'PROPERTY_INVENTORY'


@transaction.atomic
def create_project(**fields) -> Project:
    """The project's cost centre is created with it (code = project code)."""
    code = fields['code']
    if CostCenter.objects.filter(code=code).exists():
        raise AccountingError(f'A cost centre {code} already exists; choose another project code.')
    cost_center = CostCenter.objects.create(code=code, name=f'Project {fields["name"]}',
                                            property=fields.get('property'))
    fields.setdefault('wip_account', ChartOfAccount.objects.get(code=WIP_ACCOUNT))
    return Project.objects.create(cost_center=cost_center, **fields)


def _project_lines(project):
    return JournalLine.objects.filter(cost_center=project.cost_center,
                                      entry__status__in=JournalEntry.LEDGER_STATUSES)


def wip_balance(project, as_of=None) -> Decimal:
    lines = _project_lines(project).filter(account=project.wip_account)
    if as_of:
        lines = lines.filter(entry__entry_date__lte=as_of)
    agg = lines.aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
    return (agg['dr'] or ZERO) - (agg['cr'] or ZERO)


def cost_report(project) -> dict:
    """Costs incurred (WIP debits, excluding capitalisation) and project expenses, vs budget."""
    lines = _project_lines(project).exclude(entry__source_module='project_capitalisation')
    by_account = lines.filter(Q(account=project.wip_account) | Q(account__account_type='expense')).values(
        'account__code', 'account__name').annotate(
        dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit'))).order_by('account__code')
    rows = [{'code': r['account__code'], 'name': r['account__name'],
             'amount': str((r['dr'] or ZERO) - (r['cr'] or ZERO))} for r in by_account]
    total = sum((Decimal(r['amount']) for r in rows), ZERO)
    capitalised = project.capitalisations.aggregate(t=Sum('amount'))['t'] or ZERO
    return {
        'project': project.code, 'budget': str(project.budget), 'cost_to_date': str(total),
        'remaining_budget': str(project.budget - total),
        'percent_of_budget': str((total / project.budget * 100).quantize(Decimal('0.1'))) if project.budget else None,
        'wip_balance': str(wip_balance(project)), 'capitalised': str(capitalised), 'by_account': rows,
        'open_commitments': str(open_commitments(project)),
    }


def open_commitments(project) -> Decimal:
    """Ordered on issued POs but not yet invoiced."""
    from apps.procurement.models import PurchaseOrder, PurchaseOrderLine

    lines = PurchaseOrderLine.objects.filter(order__project=project).exclude(
        order__status__in=[PurchaseOrder.Status.DRAFT, PurchaseOrder.Status.CANCELLED])
    return sum(((ln.quantity - ln.invoiced_qty) * ln.unit_price for ln in lines), ZERO).quantize(Decimal('0.01'))


@transaction.atomic
def capitalise(project, on, amount=None, target=None, asset_category=None, useful_life_months=None,
               user=None) -> ProjectCapitalisation:
    """
    Move WIP to its final home.
      inventory:   Dr Property Inventory / Cr WIP, and the property's cost rises
      fixed_asset: Dr category asset account / Cr WIP, and a fixed asset with a
                   straight-line Statutory book is created
    """
    project = Project.objects.select_for_update().get(pk=project.pk)
    target = target or project.capitalise_to
    balance = wip_balance(project, on)
    amount = Decimal(amount) if amount is not None else balance
    if amount <= 0 or amount > balance:
        raise AccountingError(f'Capitalisation must be between 0 and the WIP balance ({balance}).')
    service = AccountingService(user=user)

    if target == Project.CapitaliseTo.FIXED_ASSET:
        if asset_category is None or not useful_life_months:
            raise AccountingError('Choose an asset category and useful life to capitalise into a fixed asset.')
        debit_code = asset_category.asset_cost_account.code
    else:
        debit_code = service.ACCOUNTS[INVENTORY_ACCOUNT_KEY]

    posting = PostingData(description=f'Capitalise project {project.code}', entry_date=on,
                          source_module='project_capitalisation', source_id=project.id,
                          source_reference=project.code)
    posting.add_debit(debit_code, amount, f'Capitalised from {project.code}', property_ref=project.property,
                      cost_center=project.cost_center)
    posting.add_credit(project.wip_account.code, amount, 'WIP capitalised', property_ref=project.property,
                       cost_center=project.cost_center)
    entry = service.post_entry(posting, journal_code='GJ')

    asset = None
    if target == Project.CapitaliseTo.FIXED_ASSET:
        from apps.fixed_assets.models import AssetBook, FixedAsset
        asset = FixedAsset.objects.create(
            code=f'{project.code}-{project.capitalisations.count() + 1}', name=project.name,
            category=asset_category, acquisition_date=on, acquisition_cost=amount, property_ref=project.property,
            created_by=user)
        AssetBook.objects.create(asset=asset, book_type='Statutory', method=AssetBook.DeprMethod.STRAIGHT_LINE,
                                 useful_life_months=useful_life_months, current_nbv=amount)
    elif project.property_id:
        prop = project.property
        prop.purchase_price = (prop.purchase_price or ZERO) + amount
        prop.save(update_fields=['purchase_price'])

    record = ProjectCapitalisation.objects.create(project=project, capitalisation_date=on, amount=amount,
                                                  target=target, journal_entry=entry, fixed_asset=asset,
                                                  created_by=user)
    if wip_balance(project) == 0:
        project.status = Project.Status.COMPLETED
        project.end_date = project.end_date or on
        project.save(update_fields=['status', 'end_date'])
    return record
