import os
import django
from datetime import date
from decimal import Decimal

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models import (
    ChartOfAccount, JournalEntry, JournalLine, FiscalPeriod, FiscalYear, Journal
)
from apps.finance.services.accounting import PostingData, AccountingService

def run():
    print("--- Financial Reports Test ---")
    
    # 1. Ensure we have a fiscal year and period open for today.
    today = date.today()
    period = FiscalPeriod.objects.filter(
        start_date__lte=today, 
        end_date__gte=today,
        status=FiscalPeriod.PeriodStatus.OPEN
    ).first()
    
    if not period:
        print("No open fiscal period found for today. Aborting.")
        return
        
    print(f"Using Fiscal Period: {period.name}")
    
    # get some accounts
    def get_acc(code):
        return ChartOfAccount.objects.get(code=code)
        
    bank = get_acc('1100')
    ar = get_acc('1200')
    ap = get_acc('2100')
    equity = get_acc('3100')
    sales = get_acc('4500')
    util = get_acc('6141')
    rent = get_acc('6130') # municipal rates
    
    service = AccountingService()
    
    # ensure General Journal exists
    Journal.objects.get_or_create(code='GJ', defaults={'name': 'General Journal', 'is_active': True})
    
    # 2. Inject capital
    # posting1 = PostingData("Initial Capital Injection", today)
    # posting1.add_debit(bank.code, Decimal('100000.00'), "Cash from investors")
    # posting1.add_credit(equity.code, Decimal('100000.00'), "Share capital")
    # service.post_entry(posting1)
    
    # 3. Make a sale
    # posting2 = PostingData("Property Sale 001", today)
    # posting2.add_debit(ar.code, Decimal('50000.00'), "Amount owed by buyer")
    # posting2.add_credit(sales.code, Decimal('50000.00'), "Sale revenue")
    # service.post_entry(posting2)
    
    # 4. Receive partial payment
    # posting3 = PostingData("Payment received for Sale 001", today)
    # posting3.add_debit(bank.code, Decimal('20000.00'), "Bank receipt")
    # posting3.add_credit(ar.code, Decimal('20000.00'), "AR reduction")
    # service.post_entry(posting3)
    
    # 5. Operating Expenses
    # posting4 = PostingData("Monthly utilities and rates", today)
    # posting4.add_debit(util.code, Decimal('1500.00'), "Utilities expense")
    # posting4.add_debit(rent.code, Decimal('500.00'), "Municipal rates")
    # posting4.add_credit(ap.code, Decimal('2000.00'), "Unpaid vendor bills")
    # service.post_entry(posting4)

    print("Sample transactions posted successfully!")
    print("\n--- Generating Reports ---\n")
    
    # 6. Trial Balance logic
    print("=== TRIAL BALANCE ===")
    tb_data = service.generate_trial_balance(period)
    print(f"{'Account':<35} | {'Debit':>12} | {'Credit':>12}")
    print("-" * 65)
    for row in tb_data['accounts']:
        dr = Decimal(str(row['total_debit'] or '0'))
        cr = Decimal(str(row['total_credit'] or '0'))
        if dr > 0 or cr > 0:
            print(f"{row['code']} - {row['name'][:25]:<25} | {dr:>12.2f} | {cr:>12.2f}")
    print("-" * 65)
    print(f"{'TOTALS':<35} | {Decimal(str(tb_data['total_debit'] or 0)):>12.2f} | {Decimal(str(tb_data['total_credit'] or 0)):>12.2f}")
    
    # 7. Income Statement Logic
    from django.db.models import Sum, Q
    print("\n=== INCOME STATEMENT ===")
    qs = JournalLine.objects.filter(
        entry__status=JournalEntry.EntryStatus.POSTED,
        entry__entry_date__range=[today.replace(day=1), today],
        account__account_type__in=['revenue', 'expense']
    )
    lines = qs.values('account__code', 'account__name', 'account__account_type').annotate(
        total_debit=Sum('amount', filter=Q(side='debit')),
        total_credit=Sum('amount', filter=Q(side='credit')),
    ).order_by('account__account_type', 'account__code')
    
    print("REVENUE:")
    tot_rev = Decimal('0')
    tot_exp = Decimal('0')
    for line in lines:
        dr = line['total_debit'] or Decimal('0')
        cr = line['total_credit'] or Decimal('0')
        if line['account__account_type'] == 'revenue':
            net = cr - dr
            tot_rev += net
            print(f"  {line['account__code']} - {line['account__name'][:25]:<25} : {net:>10.2f}")
    print(f"Total Revenue: {tot_rev:>35.2f}")
    
    print("\nEXPENSES:")
    for line in lines:
        dr = line['total_debit'] or Decimal('0')
        cr = line['total_credit'] or Decimal('0')
        if line['account__account_type'] == 'expense':
            net = dr - cr
            tot_exp += net
            print(f"  {line['account__code']} - {line['account__name'][:25]:<25} : {net:>10.2f}")
    print(f"Total Expenses: {tot_exp:>34.2f}")
    print("-" * 50)
    print(f"NET PROFIT: {(tot_rev - tot_exp):>38.2f}")

    # 8. Balance Sheet Logic
    print("\n=== BALANCE SHEET ===")
    bs_lines = JournalLine.objects.filter(
        entry__status=JournalEntry.EntryStatus.POSTED,
        entry__entry_date__lte=today,
        account__account_type__in=['asset', 'liability', 'equity']
    ).values('account__code', 'account__name', 'account__account_type').annotate(
        total_debit=Sum('amount', filter=Q(side='debit')),
        total_credit=Sum('amount', filter=Q(side='credit')),
    ).order_by('account__account_type', 'account__code')
    
    print("ASSETS:")
    tot_assets = Decimal('0')
    for line in bs_lines:
         if line['account__account_type'] == 'asset':
             dr = line['total_debit'] or Decimal('0')
             cr = line['total_credit'] or Decimal('0')
             net = dr - cr
             if net != 0:
                 print(f"  {line['account__code']} - {line['account__name'][:25]:<25} : {net:>10.2f}")
                 tot_assets += net
    print(f"Total Assets: {tot_assets:>36.2f}")
    
    print("\nLIABILITIES & EQUITY:")
    tot_liab_eq = Decimal('0')
    for line in bs_lines:
         t = line['account__account_type']
         if t in ['liability', 'equity']:
             dr = line['total_debit'] or Decimal('0')
             cr = line['total_credit'] or Decimal('0')
             net = cr - dr
             if net != 0:
                 print(f"  {line['account__code']} - {line['account__name'][:25]:<25} : {net:>10.2f}")
                 tot_liab_eq += net
                 
    net_profit = tot_rev - tot_exp
    print(f"  Current Period Net Profit{'':<10} : {net_profit:>10.2f}")
    tot_liab_eq += net_profit
    
    print(f"Total Liab & Equity: {tot_liab_eq:>29.2f}")
    print("-" * 50)
    print(f"BALANCED: {tot_assets == tot_liab_eq}")
    
if __name__ == '__main__':
    run()
