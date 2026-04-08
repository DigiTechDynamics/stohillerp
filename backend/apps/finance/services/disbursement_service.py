import csv
import io
from decimal import Decimal
from django.core.exceptions import ValidationError
from apps.rentals.models import OwnerSettlement
from apps.payroll.models import Payslip

class DisbursementService:
    @staticmethod
    def generate_eft_file(object_ids, source_type):
        """
        Generates a standard bank EFT CSV file for given object IDs.
        source_type: 'owner_settlement' or 'payslip'
        """
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header: Bank Format (Standard)
        writer.writerow(['Account Number', 'Branch Code', 'Account Name', 'Amount', 'Reference', 'Bank Name', 'Account Type'])

        if source_type == 'owner_settlement':
            items = OwnerSettlement.objects.filter(id__in=object_ids).select_related('owner', 'property')
            for item in items:
                if not item.owner.bank_account_number:
                    raise ValidationError(f"Owner {item.owner.full_name} is missing bank details.")
                
                writer.writerow([
                    item.owner.bank_account_number,
                    item.owner.bank_branch_code,
                    item.owner.full_name,
                    f"{item.net_payout_amount:.2f}",
                    f"SETT-{item.id}-{item.period_start.strftime('%m%y')}",
                    item.owner.bank_name,
                    item.owner.get_bank_account_type_display()
                ])
                
        elif source_type == 'payslip':
            items = Payslip.objects.filter(id__in=object_ids).select_related('employee')
            for item in items:
                if not item.employee.bank_account_number:
                    raise ValidationError(f"Employee {item.employee.full_name} is missing bank details.")
                
                writer.writerow([
                    item.employee.bank_account_number,
                    item.employee.bank_branch_code,
                    item.employee.full_name,
                    f"{item.net_amount:.2f}",
                    f"PAY-{item.id}-{item.date_from.strftime('%m%y')}",
                    item.employee.bank_name,
                    'Salaries'
                ])
        else:
            raise ValidationError(f"Invalid source type for disbursement: {source_type}")

        return output.getvalue()
