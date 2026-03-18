from decimal import Decimal
from datetime import date
from django.db.models import Sum

from apps.finance.models import TaxCode, TaxTransaction

class TaxService:
    """Service for VAT / Tax Reporting."""

    @staticmethod
    def generate_vat_return(start_date: date, end_date: date) -> dict:
        """
        Generates data for a VAT Return (Input Tax vs Output Tax).
        Returns aggregated totals per Tax Code and net amount payable/refundable.
        """
        # Get Output Tax (Sales) - Tax we collected and owe to SARS
        output_txns = TaxTransaction.objects.filter(
            transaction_type=TaxTransaction.TransactionType.OUTPUT,
            date__range=[start_date, end_date]
        ).values('tax_code__code', 'tax_code__rate').annotate(
            total_tax=Sum('tax_amount'),
            total_gross=Sum('gross_amount'),
            total_net=Sum('net_amount')
        )
        
        # Get Input Tax (Purchases) - Tax we paid and claim back from SARS
        input_txns = TaxTransaction.objects.filter(
            transaction_type=TaxTransaction.TransactionType.INPUT,
            date__range=[start_date, end_date]
        ).values('tax_code__code', 'tax_code__rate').annotate(
            total_tax=Sum('tax_amount'),
            total_gross=Sum('gross_amount'),
            total_net=Sum('net_amount')
        )

        total_output_tax = sum(t['total_tax'] or Decimal(0) for t in output_txns)
        total_input_tax = sum(t['total_tax'] or Decimal(0) for t in input_txns)
        
        total_sales_gross = sum(t['total_gross'] or Decimal(0) for t in output_txns)
        total_sales_net = sum(t['total_net'] or Decimal(0) for t in output_txns)
        
        total_purchases_gross = sum(t['total_gross'] or Decimal(0) for t in input_txns)
        total_purchases_net = sum(t['total_net'] or Decimal(0) for t in input_txns)

        # Net VAT Payable (if positive) or Refundable (if negative)
        vat_liability = total_output_tax - total_input_tax

        return {
            'period': {
                'start_date': str(start_date),
                'end_date': str(end_date)
            },
            'output_tax': str(total_output_tax),
            'input_tax': str(total_input_tax),
            'vat_liability': str(vat_liability),
            'total_sales_gross': str(total_sales_gross),
            'total_sales_net': str(total_sales_net),
            'total_purchases_gross': str(total_purchases_gross),
            'total_purchases_net': str(total_purchases_net),
            'output_details': list(output_txns),
            'input_details': list(input_txns)
        }
