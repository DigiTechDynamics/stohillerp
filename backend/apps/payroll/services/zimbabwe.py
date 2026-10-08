from decimal import Decimal, ROUND_HALF_UP
from ..models import TaxBracket, PayrollSetting


class PayrollConfigError(Exception):
    """A statutory rate or tax table is not configured: payroll must not guess it."""


def _base_currency_code():
    from apps.finance.services.fx import currency_code
    return currency_code(None)


class ZimbabweTaxService:
    """
    Service for calculating Zimbabwe-specific payroll deductions.
    Uses database-driven configuration for tax brackets and rates. A missing
    setting raises PayrollConfigError naming it; it used to fall back silently
    to built-in rates (AIDS levy 3%, NSSA 4.5%, NSSA ceiling 700), which would
    be wrong as soon as the law changed.
    """

    @staticmethod
    def _setting(key):
        setting = PayrollSetting.objects.filter(key=key).first()
        if setting is None:
            raise PayrollConfigError(f'Payroll setting "{key}" is not configured. '
                                     f'Add it under Payroll > Deduction settings before processing.')
        return setting.value

    @staticmethod
    def calculate_paye(taxable_income, currency_code=None):
        """Calculates PAYE based on database configured brackets."""
        currency_code = currency_code or _base_currency_code()
        income = Decimal(str(taxable_income))

        brackets = TaxBracket.objects.filter(currency__code=currency_code).order_by('min_amount')
        if not brackets.exists():
            raise PayrollConfigError(f'No PAYE tax brackets are configured for {currency_code}. '
                                     f'Add them under Payroll > Deduction settings.')

        # Find the matching bracket
        for bracket in brackets:
            if income >= bracket.min_amount and (bracket.max_amount is None or income <= bracket.max_amount):
                # tax = (income * rate) - fixed_deduction
                tax = (income * (bracket.tax_rate / Decimal('100.00'))) - bracket.fixed_deduction
                return max(Decimal('0.00'), tax).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        return Decimal('0.00')

    @classmethod
    def calculate_aids_levy(cls, paye_amount):
        """AIDS Levy is a percentage of PAYE, fetched from PayrollSetting."""
        rate = cls._setting('aids_levy_rate')
        return (Decimal(str(paye_amount)) * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    @classmethod
    def calculate_nssa(cls, basic_salary, currency_code=None):
        """
        NSSA Pension contribution (Employee share).
        Uses configured rate and currency-specific ceilings.
        """
        currency_code = currency_code or _base_currency_code()
        salary = Decimal(str(basic_salary))
        rate = cls._setting('nssa_rate')
        ceiling = cls._setting(f'nssa_ceiling_{currency_code.lower()}')
        pensionable_earnings = min(salary, ceiling)
        return (pensionable_earnings * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    @classmethod
    def calculate_employer_nssa(cls, basic_salary, currency_code=None):
        """Employer's NSSA share: same pensionable-earnings ceiling, employer rate."""
        employee_share = cls.calculate_nssa(basic_salary, currency_code)
        employee_rate = cls._setting('nssa_rate')
        employer_rate = cls._setting('employer_nssa_rate')
        if not employee_rate:
            return Decimal('0.00')
        return (employee_share / employee_rate * employer_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    @classmethod
    def calculate_zimdef(cls, gross_pay):
        """ZIMDEF (Zimbabwe Manpower Development Fund) levy on gross pay, employer cost."""
        rate = cls._setting('zimdef_rate')
        return (Decimal(str(gross_pay)) * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
