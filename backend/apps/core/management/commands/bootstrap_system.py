"""
manage.py bootstrap_system

Loads the reference data every Stohill installation needs (currencies, access
modules, roles, number sequences, starter chart of accounts and journals, the
current fiscal year, payroll tax tables, default CRM pipeline).

Idempotent and production-safe: run it after every deploy, right after
`migrate`. It never overwrites data an administrator has customised.
"""

from django.core.management.base import BaseCommand

from apps.core import seeds as core_seeds
from apps.crm.seeds import seed_crm_defaults
from apps.documents.seeds import seed_document_types
from apps.finance.seeds import seed_finance_defaults
from apps.payroll.seeds import seed_payroll_config
from apps.properties.seeds import seed_property_types
from apps.propman.seeds import seed_arrears_stages

# Order matters: later steps depend on earlier ones (e.g. payroll brackets
# need currencies; role-module mapping needs modules).
STEPS = [
    ("Currencies", core_seeds.seed_currencies),
    ("Access modules", core_seeds.seed_modules),
    ("Roles & default module access", core_seeds.seed_roles),
    ("Number sequences", core_seeds.seed_number_sequences),
    ("Chart of accounts, journals, posting profile, current fiscal year", seed_finance_defaults),
    ("Payroll configuration (ZW)", seed_payroll_config),
    ("CRM pipeline & lost reasons", seed_crm_defaults),
    ("Arrears collection stages", seed_arrears_stages),
    ("Document types", seed_document_types),
    ("Property types", seed_property_types),
]


class Command(BaseCommand):
    help = "Load required reference data (idempotent, safe in production)."

    def handle(self, *args, **options):
        for label, step in STEPS:
            self.stdout.write(f"  {label}...", ending="")
            step()
            self.stdout.write(self.style.SUCCESS(" ok"))
        self.stdout.write(self.style.SUCCESS("Bootstrap complete."))
