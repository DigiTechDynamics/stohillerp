"""
Builds docs/uat/Stohill_ERP_UAT_Test_Scripts.pdf, the user acceptance test
pack. Edit the SCRIPTS data below and re-run:

    backend/.venv/Scripts/python docs/uat/build_uat_pdf.py      (Windows)
    backend/.venv/bin/python docs/uat/build_uat_pdf.py          (Linux/macOS)

Needs reportlab (already a backend dependency).
"""

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

OUT = Path(__file__).with_name('Stohill_ERP_UAT_Test_Scripts.pdf')
VERSION = '1.0'

# ─── Test content ────────────────────────────────────────────────────────────
# Each script: id, title, who runs it, preconditions, [(action, expected result)].

SECTIONS = [
    ('Access and security', [
        ('SEC-01', 'Sign in, sign out and failed logins', 'Any staff user', 'A staff login exists.', [
            ('Open the site and sign in with your email and password.', 'The Command Center dashboard opens. The login form was empty when the page loaded.'),
            ('Sign out from the sidebar.', 'You return to the login page. Pressing Back does not show ERP data.'),
            ('Sign in with a wrong password.', '"Invalid credentials" is shown; no access.'),
            ('Try a wrong password more than 10 times within a minute.', 'Further attempts are refused for a short time (rate limit).'),
        ]),
        ('SEC-02', 'Module access follows the role', 'System administrator + a test user', 'A role with only Rental Management access.', [
            ('In User Access Control (/user-access), create a user with that role and set their password.', 'User is created and appears in the user list with that role.'),
            ('Sign in as the new user.', 'The sidebar shows only the modules of the role.'),
            ('Type a finance address in the browser, e.g. /finance/ap.', 'No finance data loads (access denied / empty); nothing can be saved.'),
        ]),
        ('SEC-03', 'Maker/checker on journal batches', 'Two finance users (A and B)', 'Both have GL access.', [
            ('User A creates a journal batch and submits it for approval.', 'Batch shows "pending approval".'),
            ('User A tries to approve it.', 'Refused: the maker cannot approve their own batch.'),
            ('User B approves it.', 'Batch posts; entries appear in the trial balance.'),
        ]),
    ]),
    ('General ledger and period end', [
        ('GL-01', 'Manual journal and reversal', 'Accountant', 'An open period.', [
            ('Finance > GL > New journal: Dr an expense, Cr bank, equal amounts, with a narration.', 'Journal saves; totals balance.'),
            ('Try to save a journal whose debits and credits differ.', 'Refused with an "unbalanced" message.'),
            ('Post the balanced journal (through approval if required).', 'Trial balance shows the amounts on both accounts.'),
            ('Reverse the posted entry.', 'A reversing entry is created; both accounts return to their prior balances.'),
        ]),
        ('GL-02', 'Cost centres and reports', 'Accountant', 'At least one cost centre (Finance Settings > Cost Centres).', [
            ('Post a journal with a cost centre on the expense line.', 'Entry posts.'),
            ('Reports: run the P&L filtered by that cost centre.', 'Only lines with that cost centre are included.'),
            ('Run Trial Balance, Balance Sheet, Cash Flow and GL Detail for the month; export one to CSV.', 'Balance sheet balances; the cash-flow check matches bank movement; CSV opens in Excel.'),
        ]),
        ('GL-03', 'Recurring journal', 'Accountant', 'None.', [
            ('Finance Settings > Recurring Journals > New template: monthly accrual, first run today, "Reverse next period" ticked.', 'Template saves; Dr and Cr totals shown equal.'),
            ('Click "Run due now".', 'A message reports 1 recurring entry; the entry exists in draft (or posted if auto-post).'),
            ('Check next run date on the template.', 'Moved forward one month.'),
        ]),
        ('GL-04', 'Close a period', 'Finance manager', 'A test period with no further activity expected.', [
            ('Fiscal Periods: close the period.', 'Period shows closed.'),
            ('Try to post a journal dated in that period.', 'Refused: the period is closed.'),
        ]),
    ]),
    ('Accounts receivable', [
        ('AR-01', 'Invoice, PDF, email and aging', 'AR clerk', 'A customer with an email address.', [
            ('Accounts Receivable: create an invoice with two lines and VAT; post it.', 'Invoice posted; the page total "Outstanding customer balances" increases by the invoice total.'),
            ('Download the invoice PDF.', 'A real PDF with your company details and the lines.'),
            ('Email the invoice.', 'Success message; the customer receives the email with the PDF.'),
            ('Reports > AR Aging.', 'Invoice appears in the correct age bucket.'),
        ]),
        ('AR-02', 'Receipt applied to chosen invoices', 'AR clerk', 'Customer has two open invoices.', [
            ('Record and post a receipt smaller than the two invoices together.', 'Receipt posts to the bank account.'),
            ('Open the receipt > Apply to invoices > "Oldest first" > Apply.', 'The oldest invoice is paid first; the rest goes to the next; unapplied shows 0.'),
            ('Check allocation history on the receipt.', 'Each allocation listed with amount and journal reference.'),
        ]),
        ('AR-03', 'Credit note, write-off and refund', 'AR clerk + finance manager', 'An open invoice; a receipt with an unapplied balance.', [
            ('Create an invoice with Document Type = Credit note; post it; apply it to the open invoice.', 'Invoice balance reduced by the credit; VAT return shows the credit.'),
            ('Write off a small remaining balance with a reason.', 'Invoice closed; amount posted to bad debts.'),
            ('Refund the unapplied receipt balance to the customer.', 'Refund posted from the bank; unapplied balance becomes 0.'),
        ]),
        ('AR-04', 'Statements and foreign currency', 'AR clerk + accountant', 'An exchange rate for a second currency (e.g. ZWG).', [
            ('Customer row > Statement.', 'PDF statement for the last 90 days with opening and closing balances.'),
            ('Post an invoice in the second currency; receive payment after the rate changes.', 'Realised exchange gain/loss is posted automatically.'),
            ('Finance Settings > FX Revaluation for month end.', 'Open foreign items listed with gain/(loss); entry posts and shows its reversal date.'),
        ]),
    ]),
    ('Purchasing and accounts payable', [
        ('PUR-01', 'Purchase order approval', 'Buyer (A) + approver (B)', 'Finance Settings > Approval Rules: Purchase order from 1,000, approver role = B\'s role.', [
            ('Purchasing > New Purchase Order (A): supplier, 2 lines over 1,000 total; save draft.', 'PO created as draft with a PO- number.'),
            ('A clicks Issue.', 'Refused: approval is required.'),
            ('A tries to approve in the approval box.', 'Refused: the creator cannot approve.'),
            ('B approves; A issues.', 'Status Issued.'),
        ]),
        ('PUR-02', 'Goods receipt and 3-way match', 'Stores + AP clerk', 'An issued PO.', [
            ('Receive goods for part of one line (goods received note).', 'GRN- number shown; received quantity updated; status Partially received.'),
            ('Try to receive more than ordered.', 'Refused.'),
            ('"Invoice received goods" with the supplier\'s invoice number.', 'Draft supplier invoice created for the received quantity only.'),
            ('Post that invoice in Accounts Payable.', 'Posts; match status shows no exceptions.'),
        ]),
        ('PUR-03', 'Match exception and override', 'AP clerk (A) + finance manager (B)', 'A PO-linked draft invoice.', [
            ('Edit the invoice price more than 2% above the PO price; try to post.', 'Refused: 3-way match failed, with the reason.'),
            ('A tries to override the match.', 'Refused: someone else must override.'),
            ('B overrides with a reason; A posts.', 'Posts; the override and reason are recorded on the invoice.'),
        ]),
        ('AP-01', 'Supplier invoice and payment approvals', 'AP clerk + approver', 'Approval rules for supplier invoice and supplier payment.', [
            ('Enter and approve a supplier invoice; post it.', 'Posting blocked until approved; then posts.'),
            ('Create a payment; approve it; post it; apply it to the invoice.', 'Invoice paid; payment unapplied balance 0; AP aging reduced.'),
            ('Enter a supplier credit note and apply it to another invoice.', 'Invoice balance reduced.'),
            ('Supplier > Statement PDF.', 'Statement shows the invoices, payment and credit.'),
        ]),
    ]),
    ('Banking and reconciliation', [
        ('BNK-01', 'Statement import', 'Accountant', 'A bank account linked to its GL account. A CSV from your bank with a header row: date, description, reference and either amount (money in positive) or debit and credit columns. Dates as YYYY-MM-DD or DD/MM/YYYY.', [
            ('Bank & Cash > Upload statement for the account.', 'Lines imported; count shown.'),
            ('Upload the same file again.', 'Duplicates are skipped; no double lines.'),
        ]),
        ('BNK-02', 'Reconcile', 'Accountant', 'Imported statement with lines that match posted receipts/payments, plus a bank charge.', [
            ('Add a reconciliation rule (e.g. keyword "CHARGES" auto-post to bank charges); run auto-match.', 'Matching lines matched; the charge line posted automatically.'),
            ('Match a remaining line manually to its ledger line; then undo and redo it.', 'Match, undo and redo work; one ledger line cannot be matched twice.'),
            ('Post an adjustment for any other unmatched bank-only item.', 'Adjustment journal created and matched.'),
            ('Open the reconciliation report.', 'Difference is 0; outstanding items listed.'),
        ]),
    ]),
    ('Property and rentals', [
        ('REN-01', 'New lease, deposit and billing', 'Rentals officer', 'A property/unit and a tenant contact.', [
            ('Create a lease and activate it.', 'Lease listed as active.'),
            ('Lease > Deposit: record the deposit.', 'Deposit shown as held in trust; trust bank and tenant deposits accounts updated.'),
            ('Lease > Recurring charges: add a service charge.', 'Charge listed with monthly amount.'),
            ('Lease > Billing > Bill now.', 'Invoice(s) created including rent and the charge; posted to AR.'),
        ]),
        ('REN-02', 'Rent payment and arrears', 'Rentals officer', 'An unpaid rental invoice.', [
            ('Record a rent payment against the invoice.', 'Invoice paid/partly paid; tenant balance reduced.'),
            ('Leave an invoice unpaid past the grace period and let the daily jobs run (or ask IT to run them).', 'Reminder sent; late fee invoiced and posted per the agreed terms.'),
        ]),
        ('REN-03', 'Renewal, termination and deposit release', 'Rentals manager', 'An active lease with a deposit and arrears.', [
            ('Renew the lease with a new end date and rent.', 'A follow-on lease number is created; charges and deposit carried over.'),
            ('On another lease, Terminate early with a date mid-period.', 'Credit notes raised for billed periods after the date; short notice flagged if applicable.'),
            ('Release deposit, applying part to arrears.', 'Arrears settled from the deposit; the rest refunded.'),
        ]),
        ('REN-04', 'Maintenance to contractor bill and recharge', 'Rentals officer', 'A contractor set up as a supplier.', [
            ('Log a maintenance ticket; later click Complete job with contractor, actual cost, invoice number, Recharge tenant ticked.', 'Ticket completed; message names the supplier bill and the tenant recharge invoice.'),
            ('Check AP and AR.', 'Contractor bill in AP; recharge invoice on the tenant in AR.'),
        ]),
        ('REN-05', 'Owner (landlord) trust account', 'Finance officer', 'A managed property with an owner and collected rent.', [
            ('Rental Management > Owners.', 'Owner shows held in trust, not yet collected, and available to pay.'),
            ('Download the owner statement.', 'PDF lists rent, management fee and any repairs.'),
            ('Pay out more than "available to pay".', 'Refused.'),
            ('Pay out the available amount from the trust bank account.', 'Payout posted; available becomes 0.'),
        ]),
    ]),
    ('Sales, commissions and projects', [
        ('SAL-01', 'Brokered sale and agent commission', 'Sales admin + finance', 'A listed property, buyer, seller and agent.', [
            ('Record a brokered sale; confirm the deal; post to finance.', 'Only the agency commission is invoiced (to the seller); no cost of sale.'),
            ('Approve the agent commission.', 'Commission accrued using the commission structure split.'),
        ]),
        ('PRJ-01', 'Development project cost and capitalisation', 'Project accountant', 'None.', [
            ('Development Projects > New Project with a budget; capitalise to inventory, linked property.', 'Project created with its own cost centre.'),
            ('Raise a PO for the project and receive it.', 'Cost report shows the open commitment.'),
            ('Invoice and post it.', 'Cost to date rises; amount held in Work in Progress (1540).'),
            ('Capitalise WIP (all).', 'Journal posted; property cost price increased; project completed.'),
        ]),
    ]),
    ('Payroll and fixed assets', [
        ('PAY-01', 'Payroll run and statutory figures', 'Payroll officer (A) + approver (B)', 'Two test employees with contracts; one with income above the top PAYE bracket.', [
            ('Payroll > New run for the month; Process.', 'Run shows gross, deductions and net.'),
            ('Compare PAYE, AIDS levy, NSSA (employee and employer) and ZIMDEF with a manual calculation for both employees.', 'Figures agree with current ZIMRA/NSSA rates.'),
            ('A clicks Approve.', 'Refused: the person who processed the run must not approve it.'),
            ('B approves; download the bank payment file; email payslips; Pay all.', 'CSV lists net pay per employee; payslips received; run Paid; GL entries posted.'),
        ]),
        ('FA-01', 'Asset lifecycle', 'Accountant', 'An asset category.', [
            ('Add an asset; run depreciation for a month.', 'Depreciation posted once (statutory book only); NBV reduced.'),
            ('Dispose of the asset with proceeds.', 'Gain or loss on disposal posted; asset closed.'),
        ]),
    ]),
    ('Tenant portal', [
        ('POR-01', 'Invite and activate', 'Rentals officer + a tenant tester', 'Tenant contact with a real test email address.', [
            ('CRM contact (type tenant) > Invite to portal.', 'Message: invitation emailed. Staff never see the link.'),
            ('Tenant opens the email link, sets a password.', '"Your account is ready".'),
            ('Tenant signs in.', 'Lands on the tenant portal (not the ERP). Typing /dashboard sends them back to the portal.'),
        ]),
        ('POR-02', 'Tenant self-service', 'Tenant tester', 'Tenant has invoices and an active lease.', [
            ('Check Home, Invoices (download a PDF), Statement (PDF).', 'Only the tenant\'s own leases and invoices; balances match the ERP.'),
            ('Log a maintenance request.', 'Reference shown; the ticket appears in the staff Maintenance tab.'),
            ('A second tenant tries to open the first tenant\'s invoice PDF link.', 'Refused / not found.'),
        ]),
        ('POR-03', 'Online payment', 'Tenant tester + finance', 'UAT: test gateway. Pre-production: live Paynow with a small real amount.', [
            ('Select two open invoices > Pay online; complete the payment.', 'Returned to the payment page: "Payment received".'),
            ('Refresh the payment page several times.', 'Still one receipt only (no double posting).'),
            ('Staff check AR / rentals.', 'Receipt posted to the online-payments bank account; invoices paid.'),
            ('Start a payment and cancel it at the gateway.', 'Shows "Payment was not completed"; invoices remain open.'),
        ]),
    ]),
    ('Operations (IT)', [
        ('OPS-01', 'Backups and restore drill', 'IT', 'Production-like server.', [
            ('Check the backup service is healthy and a dump from today exists in BACKUP_DIR.', 'Healthy; file present; LAST_STATUS starts with "ok".'),
            ('Confirm the backup folder is copied off the server.', 'Copy exists in the off-site location.'),
            ('Restore the latest dump into a scratch database and count users/journal entries.', 'Restore succeeds; counts match production.'),
        ]),
        ('OPS-02', 'Scheduled jobs and monitoring', 'IT', 'SENTRY_DSN and an uptime monitor configured.', [
            ('Check scheduler logs the morning after the first night.', 'Billing, overdue, depreciation and recurring journal jobs ran without errors.'),
            ('Stop the api container briefly.', 'Uptime monitor alerts on /api/v1/health/; clears when restarted.'),
            ('Ask a developer to trigger a test error.', 'The error appears in Sentry with no personal data.'),
            ('Send a test email (e.g. a payslip) from the live system.', 'Delivered via SMTP, not only to the logs.'),
        ]),
    ]),
]

MONTH_END = [
    'Bill rent (automatic daily job) and review the invoices raised.',
    'Import all bank statements and reconcile every bank account to a zero difference.',
    'Allocate every receipt and supplier payment; clear unapplied cash.',
    'Match and post all supplier invoices (3-way match for PO purchases).',
    'Process, approve and pay payroll; remit PAYE/AIDS levy, NSSA and ZIMDEF from the statutory summary.',
    'Run depreciation and recurring journals (automatic) and review them.',
    'Run FX revaluation at the month-end rate.',
    'Pay owners their available balances and send owner statements.',
    'Review AR/AP aging, the VAT return and budget vs actual.',
    'Close the period; confirm postings into it are refused.',
    'Run Trial Balance, P&L, Balance Sheet and Cash Flow; the balance sheet balances and the cash flow agrees to bank.',
]

# ─── Layout ──────────────────────────────────────────────────────────────────

styles = getSampleStyleSheet()
BRAND = colors.HexColor('#B7791F')
DARK = colors.HexColor('#222222')
MUTED = colors.HexColor('#666666')
H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=20, textColor=DARK, spaceAfter=6)
H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=14, textColor=BRAND, spaceBefore=4, spaceAfter=6)
BODY = ParagraphStyle('Body', parent=styles['BodyText'], fontSize=9.5, leading=13)
SMALL = ParagraphStyle('Small', parent=BODY, fontSize=8.5, leading=11)
CELL = ParagraphStyle('Cell', parent=BODY, fontSize=8.5, leading=11)
CELL_B = ParagraphStyle('CellB', parent=CELL, fontName='Helvetica-Bold')
TITLE = ParagraphStyle('Title', parent=H1, fontSize=30, leading=36, alignment=TA_CENTER)
SUB = ParagraphStyle('Sub', parent=BODY, fontSize=12, leading=16, alignment=TA_CENTER, textColor=MUTED)

PAGE = landscape(A4)
WIDTH = PAGE[0] - 30 * mm
GRID = TableStyle([
    ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#BBBBBB')),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3E7D3')),
    ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
])


def p(text, style=CELL):
    return Paragraph(text, style)


def script_block(sid, title, who, pre, steps):
    head = Table([[p(f'<b>{sid}</b>', CELL_B), p(f'<b>{title}</b>', CELL_B),
                   p(f'<b>Run by:</b> {who}'), p('<b>Tester:</b>'), p('<b>Date:</b>')]],
                 colWidths=[WIDTH * w for w in (0.08, 0.37, 0.25, 0.16, 0.14)])
    head.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FBF6EC')),
                              ('BOX', (0, 0), (-1, -1), 0.6, BRAND), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
    pre_t = Table([[p(f'<b>Before you start:</b> {pre}')]], colWidths=[WIDTH])
    rows = [[p('<b>#</b>'), p('<b>Action</b>'), p('<b>Expected result</b>'), p('<b>Pass / Fail</b>'), p('<b>Notes / defect ref</b>')]]
    rows += [[p(str(i)), p(a), p(e), p(''), p('')] for i, (a, e) in enumerate(steps, 1)]
    t = Table(rows, colWidths=[WIDTH * w for w in (0.04, 0.36, 0.34, 0.08, 0.18)], repeatRows=1)
    t.setStyle(GRID)
    return KeepTogether([head, pre_t, t, Spacer(1, 7 * mm)])


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(15 * mm, 8 * mm, f'Stohill Properties ERP - User Acceptance Test Scripts v{VERSION}')
    canvas.drawRightString(PAGE[0] - 15 * mm, 8 * mm, f'Page {doc.page}')
    canvas.restoreState()


def build():
    story = [Spacer(1, 45 * mm),
             p('Stohill Properties ERP', TITLE),
             p('User Acceptance Test Scripts', ParagraphStyle('T2', parent=TITLE, fontSize=20, textColor=BRAND)),
             Spacer(1, 8 * mm),
             p(f'Version {VERSION} - {date.today():%d %B %Y}', SUB),
             p('Run by each department before go-live. A module is accepted when all its scripts pass '
               'and every Critical/High defect is fixed and retested.', SUB),
             PageBreak()]

    story += [p('How to use this pack', H1), p(
        '<b>Where to test.</b> Use a test copy of the system restored from a recent backup, never live data. '
        'Online payments use the test gateway in UAT; do one small live Paynow payment in pre-production.<br/><br/>'
        '<b>Who.</b> Each script names the role that runs it. Where two people are named (e.g. A and B), '
        'use two different logins: several controls check that the same person cannot both create and approve.<br/><br/>'
        '<b>Recording.</b> Tick Pass or Fail for every step. On a Fail, write what happened and a defect reference '
        '(e.g. D-012) and log it in the defect log at the back, with screenshots where possible.<br/><br/>'
        '<b>Severity.</b> <b>Critical</b> - wrong figures posted to the ledger, data visible to the wrong person, '
        'or a process cannot be completed. <b>High</b> - a process needs a workaround. <b>Medium</b> - incorrect '
        'display or message, no wrong data. <b>Low</b> - cosmetic.<br/><br/>'
        '<b>Order.</b> Run Access and security first, then the modules in the order of this pack, then the '
        'month-end walkthrough, which exercises everything together.', BODY), Spacer(1, 6 * mm)]

    summary = [[p('<b>Section</b>'), p('<b>Scripts</b>'), p('<b>Owner</b>'), p('<b>Result</b>')]]
    for name, scripts in SECTIONS:
        summary.append([p(name), p(', '.join(s[0] for s in scripts)), p(''), p('')])
    st = Table(summary, colWidths=[WIDTH * w for w in (0.3, 0.4, 0.15, 0.15)], repeatRows=1)
    st.setStyle(GRID)
    story += [p('Summary', H2), st, PageBreak()]

    for name, scripts in SECTIONS:
        story.append(p(name, H1))
        story += [script_block(*s) for s in scripts]
        story.append(PageBreak())

    rows = [[p('<b>#</b>'), p('<b>Month-end task</b>'), p('<b>Done by</b>'), p('<b>Date</b>'), p('<b>OK?</b>')]]
    rows += [[p(str(i)), p(t), p(''), p(''), p('')] for i, t in enumerate(MONTH_END, 1)]
    mt = Table(rows, colWidths=[WIDTH * w for w in (0.04, 0.6, 0.16, 0.1, 0.1)], repeatRows=1)
    mt.setStyle(GRID)
    story += [p('End-to-end month-end walkthrough', H1),
              p('Run one complete month in the test copy with real (anonymised) volumes. This is the final check '
                'that the modules work together.', BODY), Spacer(1, 4 * mm), mt, PageBreak()]

    defects = [[p('<b>Ref</b>'), p('<b>Script / step</b>'), p('<b>What happened</b>'), p('<b>Severity</b>'),
                p('<b>Raised by / date</b>'), p('<b>Fixed in</b>'), p('<b>Retested OK</b>')]]
    defects += [[p(f'D-{i:03d}'), p(''), p(''), p(''), p(''), p(''), p('')] for i in range(1, 19)]
    dt = Table(defects, colWidths=[WIDTH * w for w in (0.06, 0.12, 0.38, 0.09, 0.14, 0.1, 0.11)],
               rowHeights=[None] + [9 * mm] * 18, repeatRows=1)
    dt.setStyle(GRID)
    story += [p('Defect log', H1), dt, PageBreak()]

    sign = [[p('<b>Area</b>'), p('<b>Accepted by (name, role)</b>'), p('<b>Signature</b>'), p('<b>Date</b>'), p('<b>Open defects / conditions</b>')]]
    sign += [[p(a), p(''), p(''), p(''), p('')] for a in
             ['Finance (GL, AR, AP, banking, reporting)', 'Purchasing and projects', 'Property and rentals',
              'Sales and commissions', 'Payroll', 'Tenant portal', 'IT operations (backups, monitoring)',
              'Go-live approval (management)']]
    sg = Table(sign, colWidths=[WIDTH * w for w in (0.26, 0.24, 0.16, 0.1, 0.24)],
               rowHeights=[None] + [13 * mm] * 8, repeatRows=1)
    sg.setStyle(GRID)
    story += [p('Acceptance sign-off', H1),
              p('Sign when every script in the area has passed and no Critical or High defect remains open.', BODY),
              Spacer(1, 4 * mm), sg]

    doc = SimpleDocTemplate(str(OUT), pagesize=PAGE, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=14 * mm, bottomMargin=15 * mm,
                            title='Stohill ERP - UAT Test Scripts', author='Stohill Properties')
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return OUT


if __name__ == '__main__':
    out = build()
    count = sum(len(s) for _, s in SECTIONS)
    steps = sum(len(x[4]) for _, s in SECTIONS for x in s)
    print(f'{out} ({count} scripts, {steps} steps)')
