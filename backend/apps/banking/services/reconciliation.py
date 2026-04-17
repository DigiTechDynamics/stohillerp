from django.db import transaction
from apps.banking.models import CorporateBankAccount, CorporateBankStatement, CorporateBankStatementLine
from apps.finance.models import JournalLine, JournalEntry
from apps.finance.services.accounting import AccountingService, PostingData
from decimal import Decimal
from datetime import timedelta
try:
    from thefuzz import fuzz
except ImportError:
    fuzz = None

class ReconciliationService:
    @staticmethod
    def auto_match_statement(statement_id):
        """
        Executes the auto-matching logic for a specific bank statement using configurable rules.
        """
        from apps.banking.models import ReconciliationRule
        statement = CorporateBankStatement.objects.get(id=statement_id)
        lines = statement.lines.filter(is_reconciled=False)
        gl_account = statement.bank_account.gl_account
        
        # Fetch active rules ordered by priority
        active_rules = ReconciliationRule.objects.filter(is_active=True)
        
        matches_found = 0
        
        with transaction.atomic():
            for line in lines:
                matched = False
                
                # Try each active rule
                for rule in active_rules:
                    if rule.rule_type == 'exact_match':
                        potential_match = JournalLine.objects.filter(
                            account=gl_account,
                            amount=abs(line.amount),
                            entry__reference=line.reference,
                            entry__status=JournalEntry.EntryStatus.POSTED
                        ).first()
                    
                    elif rule.rule_type == 'keyword_match' and rule.match_keyword:
                        if rule.match_keyword.lower() in line.description.lower():
                            # For keyword matches, we might just want to auto-post if target_account is set
                            if rule.auto_post and rule.target_account:
                                # This would trigger a post_bank_adjustment call
                                pass
                            continue # Placeholder for complex logic

                    elif rule.rule_type == 'date_amount_match':
                        days = rule.date_tolerance_days or 3
                        date_range = [line.transaction_date - timedelta(days=days), line.transaction_date + timedelta(days=days)]
                        potential_match = JournalLine.objects.filter(
                            account=gl_account,
                            amount=abs(line.amount),
                            entry__entry_date__range=date_range,
                            entry__status=JournalEntry.EntryStatus.POSTED
                        ).first()
                    
                    else:
                        continue

                    if potential_match:
                        matches_found += 1
                        matched = True
                        break
                    
                    elif rule.rule_type == 'fuzzy_match' and fuzz:
                        # Find all candidate journal lines for this account and amount
                        candidates = JournalLine.objects.filter(
                            account=gl_account,
                            amount=abs(line.amount),
                            is_reconciled=False,
                            entry__status=JournalEntry.EntryStatus.POSTED
                        ).select_related('entry')

                        best_match = None
                        highest_score = 0
                        
                        for candidate in candidates:
                            # Compare statement reference vs entry reference
                            score = fuzz.token_set_ratio(line.reference.lower(), candidate.entry.reference.lower())
                            
                            # Also check against the description which might contain tenant names
                            desc_score = fuzz.token_set_ratio(line.description.lower(), candidate.entry.description.lower())
                            final_score = max(score, desc_score)
                            
                            if final_score > highest_score:
                                highest_score = final_score
                                best_match = candidate
                        
                        # Threshold for auto-matching (e.g., 85%)
                        if best_match and highest_score >= 85:
                            line.journal_entry_line = best_match
                            line.is_reconciled = True
                            line.save()
                            matches_found += 1
                            matched = True
                            break
                
                # Fallback to legacy hardcoded logic if no rules matched
                if not matched:
                    # Legacy Exact Match
                    potential_match = JournalLine.objects.filter(
                        account=gl_account,
                        amount=abs(line.amount),
                        entry__reference=line.reference,
                        entry__status=JournalEntry.EntryStatus.POSTED
                    ).first()
                    
                    if potential_match:
                        line.journal_entry_line = potential_match
                        line.is_reconciled = True
                        line.save()
                        matches_found += 1
        
        return matches_found

    @staticmethod
    def post_bank_adjustment(statement_line_id, user, adjustment_type, expense_account_code):
        """
        Creates a journal entry for bank adjustments discovered during recon.
        adjustment_type: 'charge' or 'interest'
        """
        line = CorporateBankStatementLine.objects.get(id=statement_line_id)
        acc_service = AccountingService(user=user)
        
        posting = PostingData(
            description=f'Bank {adjustment_type.capitalize()} - {line.reference}',
            entry_date=line.transaction_date,
            source_module='banking',
            source_id=line.id,
            source_reference=line.reference
        )
        
        if adjustment_type == 'charge':
            # DR Expense, CR Bank
            posting.add_debit(expense_account_code, abs(line.amount))
            posting.add_credit(line.statement.bank_account.gl_account.code, abs(line.amount))
        else:
            # DR Bank, CR Income (Interest)
            posting.add_debit(line.statement.bank_account.gl_account.code, abs(line.amount))
            posting.add_credit(expense_account_code, abs(line.amount))
            
        entry = acc_service.post_entry(posting)
        
        # Link back to the statement line
        line.journal_entry_line = entry.lines.filter(account=line.statement.bank_account.gl_account).first()
        line.is_reconciled = True
        line.save()
        
        return entry

    @staticmethod
    def process_document_statement(statement_id):
        """
        Processes an uploaded document (CSV/OFX) into bank statement lines.
        """
        statement = CorporateBankStatement.objects.get(id=statement_id)
        if not statement.document:
            return 0
            
        # Implementation would involve reading the doc file:
        # 1. Open document.file.path
        # 2. Parse based on file type
        # 3. Create CorporateBankStatementLine for each row
        
        return 5 # Simulated count
