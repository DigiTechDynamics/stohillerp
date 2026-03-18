from decimal import Decimal, ROUND_HALF_UP
from ..models import TaxBracket, PayrollSetting

class ZimbabweTaxService:
    """
    Service for calculating Zimbabwe-specific payroll deductions.
    Uses database-driven configuration for tax brackets and rates.
    """

    @staticmethod
    def calculate_paye(taxable_income, currency_code="USD"):
        """Calculates PAYE based on database configured brackets."""
        income = Decimal(str(taxable_income))
        
        # Fetch brackets for the given currency
        brackets = TaxBracket.objects.filter(currency__code=currency_code).order_by('min_amount')
        
        if not brackets.exists():
            # Fallback to 0 if no configuration exists for this currency
            return Decimal('0.00')

        # Find the matching bracket
        for bracket in brackets:
            if income >= bracket.min_amount and (bracket.max_amount is None or income <= bracket.max_amount):
                # tax = (income * rate) - fixed_deduction
                tax = (income * (bracket.tax_rate / Decimal('100.00'))) - bracket.fixed_deduction
                return max(Decimal('0.00'), tax).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        return Decimal('0.00')

    @staticmethod
    def calculate_aids_levy(paye_amount):
        """AIDS Levy is a percentage of PAYE, fetched from PayrollSetting."""
        try:
            rate_setting = PayrollSetting.objects.get(key='aids_levy_rate')
            rate = rate_setting.value
        except PayrollSetting.DoesNotExist:
            rate = Decimal('0.03') # Fallback to 3%
            
        return (Decimal(str(paye_amount)) * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    @staticmethod
    def calculate_nssa(basic_salary, currency_code="USD"):
        """
        NSSA Pension contribution (Employee share).
        Uses configured rate and currency-specific ceilings.
        """
        salary = Decimal(str(basic_salary))
        
        try:
            rate_setting = PayrollSetting.objects.get(key='nssa_rate')
            rate = rate_setting.value
        except PayrollSetting.DoesNotExist:
            rate = Decimal('0.045') # Fallback to 4.5%

        # Get currency-specific ceiling
        ceiling_key = f'nssa_ceiling_{currency_code.lower()}'
        try:
            ceiling_setting = PayrollSetting.objects.get(key=ceiling_key)
            ceiling = ceiling_setting.value
        except PayrollSetting.DoesNotExist:
            # Absolute fallbacks
            ceiling = Decimal('700.00') if currency_code == "USD" else Decimal('24763.00')
            
        pensionable_earnings = min(salary, ceiling)
        return (pensionable_earnings * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
