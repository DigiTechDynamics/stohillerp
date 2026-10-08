"""
Standard segregation-of-duties conflicts for a property ERP (UAT GAP-15).

`suggestions()` lists the standard pairs that are not yet covered by a rule
(in either direction), for User Access > SoD > Auto-suggest rules.
"""

# (module_a, module_b, severity, name, why)
STANDARD_CONFLICTS = [
    ('finance_ap', 'banking', 'critical', 'Create payables vs. release payments',
     'One person could enter a supplier invoice and pay it.'),
    ('payroll', 'hr', 'critical', 'Maintain employees vs. run payroll',
     'One person could add an employee and pay them.'),
    ('finance_ar', 'banking', 'warning', 'Raise invoices vs. receipt cash',
     'One person could bill a customer and record (or divert) the payment.'),
    ('procurement', 'finance_ap', 'warning', 'Order goods vs. approve supplier invoices',
     'One person could order from a supplier and approve the invoice for payment.'),
    ('commissions', 'payroll', 'warning', 'Approve commissions vs. pay them',
     'One person could approve a commission and pay it through payroll.'),
    ('admin', 'finance_gl', 'warning', 'Grant access vs. post journals',
     'An access administrator could give themselves posting rights.'),
    ('rentals', 'banking', 'advisory', 'Manage leases vs. bank receipts',
     'Rent could be recorded against a lease and banked by the same person.'),
]


def suggestions():
    from apps.core.models import Module, SODRule

    modules = {m.code: m for m in Module.objects.all()}
    existing = {frozenset((a, b)) for a, b in SODRule.objects.values_list('module_a__code', 'module_b__code')}
    out = []
    for a, b, severity, name, why in STANDARD_CONFLICTS:
        if a in modules and b in modules and frozenset((a, b)) not in existing:
            out.append({'module_a': str(modules[a].pk), 'module_b': str(modules[b].pk),
                        'module_a_name': modules[a].name, 'module_b_name': modules[b].name,
                        'severity': severity, 'name': name, 'description': why})
    return out
