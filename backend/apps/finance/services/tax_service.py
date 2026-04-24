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
            'period': {'start_date': str(start_date), 'end_date': str(end_date)},
            'output_details': list(output_txns),
            'input_details': list(input_txns),
            'output_tax': str(total_output_tax),
            'input_tax': str(total_input_tax),
            'total_sales_gross': str(total_sales_gross),
            'total_sales_net': str(total_sales_net),
            'total_purchases_gross': str(total_purchases_gross),
            'total_purchases_net': str(total_purchases_net),
            'vat_liability': str(vat_liability)
        }

    @staticmethod
    def generate_vat7_report(start_date: date, end_date: date) -> dict:
        """
        Generates a consolidated VAT-7 report breakdown for ZIMRA.
        Schedules data into Boxes (Standard, Zero-rated, Exempt).
        """
        # 1. Output Tax (Sales) Buckets
        output_txns = TaxTransaction.objects.filter(
            transaction_type=TaxTransaction.TransactionType.OUTPUT,
            date__range=[start_date, end_date]
        )

        std_sales = output_txns.filter(tax_code__code='VAT_STD').aggregate(
            net=Sum('net_amount'), tax=Sum('tax_amount'))
        zero_sales = output_txns.filter(tax_code__code='VAT_ZERO').aggregate(net=Sum('net_amount'))
        exempt_sales = output_txns.filter(tax_code__code='VAT_EX').aggregate(net=Sum('net_amount'))

        # 2. Input Tax (Purchases) Buckets
        input_txns = TaxTransaction.objects.filter(
            transaction_type=TaxTransaction.TransactionType.INPUT,
            date__range=[start_date, end_date]
        )

        # In Zim, most input tax is claimed on Standard rated purchases
        std_purchases = input_txns.filter(tax_code__code='VAT_STD').aggregate(
            net=Sum('net_amount'), tax=Sum('tax_amount'))
        
        capital_goods = input_txns.filter(tax_code__code='VAT_CAP').aggregate(
            net=Sum('net_amount'), tax=Sum('tax_amount')) # If applicable

        # 3. Consolidate into VAT-7 structure
        data = {
            'period': f"{start_date.strftime('%B %Y')}",
            'sales': {
                'box_1_std_rated': str(std_sales['net'] or 0),
                'box_1_tax': str(std_sales['tax'] or 0),
                'box_5_zero_rated': str(zero_sales['net'] or 0),
                'box_6_exempt': str(exempt_sales['net'] or 0),
                'total_output_tax': str(std_sales['tax'] or 0),
            },
            'purchases': {
                'box_15_std_rated': str(std_purchases['net'] or 0),
                'box_15_tax': str(std_purchases['tax'] or 0),
                'box_14_capital_goods': str(capital_goods['net'] or 0),
                'box_14_tax': str(capital_goods['tax'] or 0),
                'total_input_tax': str((std_purchases['tax'] or 0) + (capital_goods['tax'] or 0)),
            },
            'summary': {
                'net_vat_payable': str((std_sales['tax'] or 0) - (std_purchases['tax'] or 0) - (capital_goods['tax'] or 0))
            }
        }
        return data
