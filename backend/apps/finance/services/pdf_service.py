"""
Stohill Properties — PDF Generation Service
Production-grade PDF engine using ReportLab.

Generates branded, professional PDFs for:
  - Customer Invoices  (generate_invoice_pdf)
  - Customer Receipts  (generate_receipt_pdf)
  - Payslips          (generate_payslip_pdf)
  - Employee Statements (generate_statement_pdf)
"""

import io
from datetime import date
from decimal import Decimal
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable, KeepTogether
)

# ─── Brand Palette ──────────────────────────────────────────────────────────
BRAND_GOLD   = colors.HexColor('#E5A645')
BRAND_DARK   = colors.HexColor('#0D1117')
BRAND_SLATE  = colors.HexColor('#1E293B')
BRAND_MUTED  = colors.HexColor('#64748B')
BRAND_LIGHT  = colors.HexColor('#F8FAFC')
BRAND_WHITE  = colors.white
TABLE_STRIPE = colors.HexColor('#F1F5F9')
DANGER_RED   = colors.HexColor('#DC2626')
SUCCESS_GRN  = colors.HexColor('#16A34A')

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm


def _base_styles():
    styles = getSampleStyleSheet()
    base = {
        'company': ParagraphStyle('company', fontName='Helvetica-Bold', fontSize=22, textColor=BRAND_GOLD, leading=26),
        'tagline': ParagraphStyle('tagline', fontName='Helvetica', fontSize=8, textColor=BRAND_MUTED, leading=10, spaceAfter=2),
        'doc_title': ParagraphStyle('doc_title', fontName='Helvetica-Bold', fontSize=15, textColor=BRAND_DARK, leading=18),
        'section': ParagraphStyle('section', fontName='Helvetica-Bold', fontSize=8, textColor=BRAND_GOLD, leading=10, spaceBefore=8, spaceAfter=4),
        'body': ParagraphStyle('body', fontName='Helvetica', fontSize=9, textColor=BRAND_SLATE, leading=13),
        'body_bold': ParagraphStyle('body_bold', fontName='Helvetica-Bold', fontSize=9, textColor=BRAND_DARK, leading=13),
        'mono': ParagraphStyle('mono', fontName='Courier', fontSize=8.5, textColor=BRAND_DARK, leading=12),
        'right': ParagraphStyle('right', fontName='Helvetica', fontSize=9, textColor=BRAND_SLATE, leading=12, alignment=TA_RIGHT),
        'right_bold': ParagraphStyle('right_bold', fontName='Helvetica-Bold', fontSize=9, textColor=BRAND_DARK, leading=12, alignment=TA_RIGHT),
        'footer': ParagraphStyle('footer', fontName='Helvetica', fontSize=7.5, textColor=BRAND_MUTED, leading=10, alignment=TA_CENTER),
        'status_paid': ParagraphStyle('status_paid', fontName='Helvetica-Bold', fontSize=28, textColor=SUCCESS_GRN, leading=32, alignment=TA_RIGHT),
        'status_due': ParagraphStyle('status_due', fontName='Helvetica-Bold', fontSize=28, textColor=DANGER_RED, leading=32, alignment=TA_RIGHT),
        'net_pay': ParagraphStyle('net_pay', fontName='Helvetica-Bold', fontSize=18, textColor=BRAND_GOLD, leading=22, alignment=TA_RIGHT),
    }
    return base


def _fmt(amount, currency_code=None):
    """Format a monetary amount (in the company's base currency by default)."""
    if not currency_code:
        from apps.core.company import base_currency_code
        currency_code = base_currency_code()
    try:
        val = Decimal(str(amount))
        return f"{currency_code} {val:,.2f}"
    except Exception:
        return f"{currency_code} 0.00"


def _header_block(story, s, title, ref_label='', ref_value='', date_label='Date', date_value=None):
    """Shared company header + document title block."""
    from apps.core.company import company_profile, contact_line, tax_line

    company = company_profile()
    header_data = [
        [
            Paragraph(escape(company['name'].upper()), s['company']),
            Paragraph(title, s['doc_title']),
        ],
        [
            Paragraph(escape(company['tagline']), s['tagline']),
            Paragraph(f'<font color="#64748B">{ref_label}</font>  <b>{escape(str(ref_value))}</b>' if ref_value else '', s['right']),
        ],
        [
            Paragraph(escape(contact_line(company)), s['tagline']),
            Paragraph(f'{date_label}: <b>{date_value or date.today().strftime("%d %B %Y")}</b>', s['right']),
        ],
    ]
    if tax_line(company):
        header_data.append([Paragraph(escape(tax_line(company)), s['tagline']), Paragraph('', s['right'])])
    col_w = [(PAGE_W - 2 * MARGIN) * 0.55, (PAGE_W - 2 * MARGIN) * 0.45]
    t = Table(header_data, colWidths=col_w)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(t)
    story.append(HRFlowable(width='100%', thickness=1.5, color=BRAND_GOLD, spaceAfter=10))


def _footer_paragraph(s, doc_type='Document'):
    return [
        HRFlowable(width='100%', thickness=0.5, color=TABLE_STRIPE, spaceBefore=14, spaceAfter=6),
        Paragraph(
            f'Computer Generated {doc_type} — No Signature Required  •  {date.today().strftime("%d %B %Y")}',
            s['footer']
        ),
    ]


def _info_table(data, s):
    """Renders a 2-column key/value info block."""
    # Values are user data (names, references): escape them for ReportLab markup.
    rows = [[Paragraph(k, s['body']), Paragraph(escape(str(v)), s['body_bold'])] for k, v in data]
    t = Table(rows, colWidths=[45 * mm, 80 * mm])
    t.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return t


def _line_items_table(headers, rows, col_widths, s, stripe=True):
    """Generic striped line items table."""
    header_row = [Paragraph(h, ParagraphStyle('th', fontName='Helvetica-Bold', fontSize=7.5, textColor=BRAND_WHITE, leading=10, alignment=TA_RIGHT if i > 0 else TA_LEFT)) for i, h in enumerate(headers)]
    data = [header_row]
    for i, row in enumerate(rows):
        bg = TABLE_STRIPE if (stripe and i % 2 == 0) else BRAND_WHITE
        data.append(row)

    t = Table(data, colWidths=col_widths)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_SLATE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [TABLE_STRIPE, BRAND_WHITE]),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('TEXTCOLOR', (0, 0), (-1, 0), BRAND_WHITE),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (0, -1), 8),
        ('RIGHTPADDING', (-1, 0), (-1, -1), 8),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, BRAND_GOLD),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, TABLE_STRIPE),
        ('ROUNDEDCORNERS', [3]),
    ]
    t.setStyle(TableStyle(style))
    return t


# ─── Customer Invoice PDF ───────────────────────────────────────────────────

def generate_invoice_pdf(invoice) -> bytes:
    """
    Generates a branded A4 Customer Invoice PDF using ReportLab.
    Returns bytes suitable for an HTTP response with content-type application/pdf.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
    s = _base_styles()
    story = []

    currency = invoice.currency.code if invoice.currency else None
    customer_name = str(invoice.customer)
    customer_email = getattr(getattr(invoice.customer, 'contact_link', None), 'email', '') or ''
    status = (invoice.status or '').upper()
    is_paid = status in ('PAID',)

    # Header
    _header_block(story, s, 'TAX INVOICE',
                  ref_label='Invoice No.', ref_value=invoice.invoice_number,
                  date_label='Invoice Date', date_value=invoice.invoice_date.strftime('%d %b %Y'))

    # Bill To + Status watermark
    bill_data = [[
        [
            Paragraph('BILLED TO', s['section']),
            _info_table([
                ('Customer:', customer_name),
                ('Email:', customer_email or '—'),
                ('Invoice Date:', invoice.invoice_date.strftime('%d %B %Y')),
                ('Due Date:', invoice.due_date.strftime('%d %B %Y')),
                ('Reference:', invoice.reference or '—'),
            ], s),
        ],
        Paragraph('PAID' if is_paid else 'UNPAID', s['status_paid'] if is_paid else s['status_due']),
    ]]
    col_w = [(PAGE_W - 2 * MARGIN) * 0.6, (PAGE_W - 2 * MARGIN) * 0.4]
    bt = Table(bill_data, colWidths=col_w)
    bt.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
    story.append(bt)
    story.append(Spacer(1, 8 * mm))

    # Line Items
    story.append(Paragraph('LINE ITEMS', s['section']))
    usable_w = PAGE_W - 2 * MARGIN
    col_widths = [usable_w * 0.45, usable_w * 0.12, usable_w * 0.18, usable_w * 0.12, usable_w * 0.13]
    lines = invoice.lines.all() if hasattr(invoice, 'lines') else []
    rows = []
    for line in lines:
        rows.append([
            Paragraph(escape(str(line.description)), s['body']),
            Paragraph(str(line.quantity), s['right']),
            Paragraph(_fmt(line.unit_price, currency), s['right']),
            Paragraph(_fmt(line.tax_amount, currency), s['right']),
            Paragraph(_fmt(line.line_total, currency), s['right_bold']),
        ])
    if not rows:
        rows = [[Paragraph('No line items.', s['body']), '', '', '', '']]

    story.append(_line_items_table(['Description', 'Qty', 'Unit Price', 'Tax', 'Total'], rows, col_widths, s))
    story.append(Spacer(1, 6 * mm))

    # Totals box
    totals = [
        ['Subtotal:', _fmt(invoice.subtotal, currency)],
        ['Tax:', _fmt(invoice.tax_total, currency)],
        ['TOTAL DUE:', _fmt(invoice.total_amount, currency)],
        ['Amount Paid:', _fmt(invoice.amount_paid, currency)],
        ['Balance Due:', _fmt(invoice.balance_due, currency)],
    ]
    t_rows = []
    for i, (label, value) in enumerate(totals):
        bold = i in (2, 4)
        style = s['body_bold'] if bold else s['body']
        t_rows.append([Paragraph(label, style), Paragraph(value, s['right_bold'] if bold else s['right'])])

    totals_table = Table(t_rows, colWidths=[usable_w * 0.78, usable_w * 0.22])
    totals_table.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LINEABOVE', (0, 2), (-1, 2), 1, BRAND_GOLD),
        ('LINEBELOW', (0, 2), (-1, 2), 0.5, TABLE_STRIPE),
        ('LINEABOVE', (0, 4), (-1, 4), 1.5, BRAND_DARK),
        ('BACKGROUND', (0, 4), (-1, 4), BRAND_LIGHT),
    ]))
    story.append(totals_table)
    story.extend(_footer_paragraph(s, 'Invoice'))

    doc.build(story)
    return buf.getvalue()


# ─── Customer Receipt PDF ───────────────────────────────────────────────────

def generate_receipt_pdf(receipt) -> bytes:
    """A branded A4 receipt for money received from a customer, with what it paid."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
    s = _base_styles()
    story = []
    currency = receipt.currency.code if receipt.currency_id else None
    contact = getattr(receipt.customer, 'contact_link', None)

    _header_block(story, s, 'RECEIPT', ref_label='Receipt No.', ref_value=receipt.receipt_reference,
                  date_label='Date', date_value=receipt.receipt_date.strftime('%d %b %Y'))
    story.append(Paragraph('RECEIVED FROM', s['section']))
    story.append(_info_table([
        ('Customer:', str(receipt.customer)),
        ('Email:', getattr(contact, 'email', '') or '—'),
        ('Paid into:', str(receipt.bank_account.name) if receipt.bank_account_id else '—'),
        ('Status:', receipt.get_status_display()),
    ], s))
    story.append(Spacer(1, 8 * mm))

    usable_w = PAGE_W - 2 * MARGIN
    allocations = receipt.allocations.select_related('invoice').order_by('allocation_date')
    rows = [[
        Paragraph(escape(a.invoice.invoice_number if a.invoice_id else (a.get_kind_display() or 'Applied')), s['body']),
        Paragraph(a.allocation_date.strftime('%d %b %Y'), s['right']),
        Paragraph(_fmt(a.amount, currency), s['right_bold']),
    ] for a in allocations]
    if rows:
        story.append(Paragraph('APPLIED TO', s['section']))
        story.append(_line_items_table(['Invoice', 'Date', 'Amount'], rows,
                                       [usable_w * 0.5, usable_w * 0.25, usable_w * 0.25], s))
        story.append(Spacer(1, 6 * mm))

    totals = [['AMOUNT RECEIVED:', _fmt(receipt.amount, currency)]]
    if receipt.unapplied_amount:
        totals.append(['Unapplied (on account):', _fmt(receipt.unapplied_amount, currency)])
    t = Table([[Paragraph(label, s['body_bold']), Paragraph(value, s['right_bold'])] for label, value in totals],
              colWidths=[usable_w * 0.7, usable_w * 0.3])
    t.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 1.5, BRAND_GOLD),
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.extend(_footer_paragraph(s, 'Receipt'))
    doc.build(story)
    return buf.getvalue()


# ─── Payslip PDF ──────────────────────────────────────────────────────────

def generate_payslip_pdf(payslip) -> bytes:
    """
    Generates a branded Payslip PDF for a single payslip instance.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
    s = _base_styles()
    story = []

    currency = payslip.payroll_run.currency.code if payslip.payroll_run.currency else None
    emp = payslip.employee
    contract = payslip.contract

    _header_block(story, s, 'EMPLOYEE PAYSLIP',
                  ref_label='Run Ref', ref_value=str(payslip.payroll_run.name),
                  date_label='Pay Period',
                  date_value=f"{payslip.date_from.strftime('%d %b')} – {payslip.date_to.strftime('%d %b %Y')}")

    # Employee info block
    story.append(Paragraph('EMPLOYEE INFORMATION', s['section']))
    ei_data = [
        [
            _info_table([
                ('Full Name:', emp.full_name),
                ('Staff ID:', emp.employee_number or '—'),
                ('Department:', str(emp.department) if emp.department else '—'),
                ('Job Title:', str(contract.job_position) if contract else '—'),
            ], s),
            _info_table([
                ('Pay Period:', f"{payslip.date_from.strftime('%d %b %Y')} – {payslip.date_to.strftime('%d %b %Y')}"),
                ('Bank:', emp.bank_name or '—'),
                # Payslips are emailed: show only the last digits of the account.
                ('Account:', f'****{emp.bank_account_number[-4:]}' if emp.bank_account_number else '—'),
                ('Currency:', currency),
            ], s),
        ]
    ]
    ei_table = Table(ei_data, colWidths=[(PAGE_W - 2 * MARGIN) / 2, (PAGE_W - 2 * MARGIN) / 2])
    ei_table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    story.append(ei_table)
    story.append(Spacer(1, 6 * mm))

    # Lines split by category
    all_lines = list(payslip.lines.select_related('salary_rule').all()) if hasattr(payslip, 'lines') else []
    earnings = [l for l in all_lines if l.category in ('basic', 'allowance')]
    deductions = [l for l in all_lines if l.category == 'deduction']

    usable_w = PAGE_W - 2 * MARGIN
    half_w = usable_w / 2 - 4 * mm

    def _side_table(title, lines, color=SUCCESS_GRN):
        hdr = [Paragraph('Component', ParagraphStyle('th', fontName='Helvetica-Bold', fontSize=7.5, textColor=BRAND_WHITE)),
               Paragraph('Amount', ParagraphStyle('thr', fontName='Helvetica-Bold', fontSize=7.5, textColor=BRAND_WHITE, alignment=TA_RIGHT))]
        data = [hdr]
        for line in lines:
            data.append([Paragraph(escape(line.name), s['body']), Paragraph(_fmt(line.amount, currency), s['right'])])
        if not lines:
            data.append([Paragraph('None', s['body']), Paragraph('—', s['right'])])
        t = Table(data, colWidths=[half_w * 0.6, half_w * 0.4])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), BRAND_SLATE),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [TABLE_STRIPE, BRAND_WHITE]),
            ('TEXTCOLOR', (0, 0), (-1, 0), BRAND_WHITE),
            ('FONTSIZE', (0, 0), (-1, -1), 8.5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (0, -1), 8),
            ('RIGHTPADDING', (-1, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('LINEBELOW', (0, 0), (-1, 0), 1, color),
        ]))
        return t

    story.append(Paragraph('EARNINGS & DEDUCTIONS', s['section']))
    cols = [[_side_table('Earnings', earnings, SUCCESS_GRN), _side_table('Deductions', deductions, DANGER_RED)]]
    split_table = Table(cols, colWidths=[half_w + 4 * mm, half_w + 4 * mm])
    split_table.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('BOTTOMPADDING', (0, 0), (0, 0), 0)]))
    story.append(split_table)
    story.append(Spacer(1, 6 * mm))

    # Net pay summary
    gross = sum(Decimal(str(l.amount)) for l in earnings)
    total_deductions = sum(Decimal(str(l.amount)) for l in deductions)
    net = payslip.net_amount or (gross - total_deductions)

    summary = Table([
        [Paragraph('Gross Earnings', s['body']), Paragraph(_fmt(gross, currency), s['right'])],
        [Paragraph('Total Deductions', s['body']), Paragraph(f'({_fmt(total_deductions, currency)})', ParagraphStyle('rd', fontName='Helvetica', fontSize=9, textColor=DANGER_RED, leading=12, alignment=TA_RIGHT))],
        [Paragraph('NET PAY', s['body_bold']), Paragraph(_fmt(net, currency), s['net_pay'])],
    ], colWidths=[usable_w * 0.75, usable_w * 0.25])
    summary.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 0.5, TABLE_STRIPE),
        ('LINEABOVE', (0, 2), (-1, 2), 1.5, BRAND_GOLD),
        ('BACKGROUND', (0, 2), (-1, 2), BRAND_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(summary)
    story.extend(_footer_paragraph(s, 'Payslip'))

    doc.build(story)
    return buf.getvalue()


# ─── Employee Statement PDF ─────────────────────────────────────────────────

def generate_statement_pdf(statement_data: dict) -> bytes:
    """
    Generates a comprehensive Employee Earnings Statement.
    `statement_data` must match the format returned by hrAPI.employees.statement().
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
    s = _base_styles()
    story = []

    emp = statement_data.get('employee', {})
    history = statement_data.get('history', [])
    summary = statement_data.get('summary', {})

    _header_block(story, s, 'EMPLOYEE LEDGER STATEMENT',
                  ref_label='Staff ID', ref_value=emp.get('number', '—'),
                  date_label='Generated', date_value=date.today().strftime('%d %B %Y'))

    story.append(Paragraph('EMPLOYEE DETAILS', s['section']))
    story.append(_info_table([
        ('Full Name:', emp.get('name', '—')),
        ('Staff ID:', emp.get('number', '—')),
        ('Report Date:', date.today().strftime('%d %B %Y')),
    ], s))
    story.append(Spacer(1, 6 * mm))

    # Payroll history table
    story.append(Paragraph('PAYROLL HISTORY', s['section']))
    usable_w = PAGE_W - 2 * MARGIN
    col_widths = [usable_w * 0.28, usable_w * 0.1, usable_w * 0.17, usable_w * 0.15, usable_w * 0.15, usable_w * 0.15]
    rows = []
    for record in history:
        currency = record.get('currency')
        rows.append([
            Paragraph(f"<b>{escape(str(record.get('run_name', '—')))}</b><br/><font color='#64748B' size='7'>{escape(str(record.get('period', '—')))}</font>", s['body']),
            Paragraph(record.get('status', '').upper(), s['body']),
            Paragraph(record.get('reference') or '—', s['mono']),
            Paragraph(_fmt(record.get('gross', 0), currency), s['right']),
            Paragraph(f"({_fmt(record.get('deductions', 0), currency)})", ParagraphStyle('rd2', fontName='Helvetica', fontSize=8.5, textColor=DANGER_RED, leading=12, alignment=TA_RIGHT)),
            Paragraph(_fmt(record.get('net', 0), currency), s['right_bold']),
        ])
    if not rows:
        rows = [[Paragraph('No payroll history found.', s['body']), '', '', '', '', '']]

    story.append(_line_items_table(
        ['Period / Run', 'Status', 'Reference', 'Gross', 'Deductions', 'Net Pay'],
        rows, col_widths, s
    ))
    story.append(Spacer(1, 8 * mm))

    # Totals box
    summary_data = [
        [Paragraph('Total Gross Earned', s['body']), Paragraph(_fmt(summary.get('total_earnings', 0), summary.get('currency')), s['right'])],
        [Paragraph('Total Deductions', s['body']), Paragraph(f"({_fmt(summary.get('total_deductions', 0), summary.get('currency'))})", ParagraphStyle('rd3', fontName='Helvetica', fontSize=9, textColor=DANGER_RED, leading=12, alignment=TA_RIGHT))],
        [Paragraph('TOTAL NET DISBURSED', s['body_bold']), Paragraph(_fmt(summary.get('total_net', 0), summary.get('currency')), s['net_pay'])],
    ]
    t_sum = Table(summary_data, colWidths=[usable_w * 0.75, usable_w * 0.25])
    t_sum.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 0.5, TABLE_STRIPE),
        ('LINEABOVE', (0, 2), (-1, 2), 1.5, BRAND_GOLD),
        ('BACKGROUND', (0, 2), (-1, 2), BRAND_LIGHT),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t_sum)
    story.extend(_footer_paragraph(s, 'Statement'))

    doc.build(story)
    return buf.getvalue()


# ─── Account Statement PDF (customer / owner) ───────────────────────────────

def generate_account_statement_pdf(statement: dict, title: str = 'STATEMENT OF ACCOUNT') -> bytes:
    """
    A customer (or landlord) statement: opening balance, transactions with a
    running balance, closing balance and an aging summary. `statement` is the
    dict returned by the statement endpoints (finance.statements).
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN,
                            rightMargin=MARGIN)
    s = _base_styles()
    story = []
    party = statement.get('party', {})
    currency = statement.get('currency')

    _header_block(story, s, title, ref_label='Account', ref_value=party.get('reference', ''),
                  date_label='Period', date_value=f"{statement.get('from_date')} to {statement.get('to_date')}")
    story.append(Paragraph('ACCOUNT', s['section']))
    story.append(_info_table([('Name:', party.get('name', '—')), ('Email:', party.get('email') or '—')], s))
    story.append(Spacer(1, 6 * mm))

    usable_w = PAGE_W - 2 * MARGIN
    widths = [usable_w * w for w in (0.13, 0.17, 0.34, 0.12, 0.12, 0.12)]
    rows = [[Paragraph(statement.get('from_date', ''), s['body']), Paragraph('', s['mono']),
             Paragraph('<i>Balance brought forward</i>', s['body']), '', '',
             Paragraph(_fmt(statement.get('opening_balance', 0), currency), s['right_bold'])]]
    for line in statement.get('lines', []):
        rows.append([
            Paragraph(line['date'], s['body']),
            Paragraph(line.get('reference') or '—', s['mono']),
            Paragraph(escape(str(line.get('description', ''))), s['body']),
            Paragraph(_fmt(line['debit'], currency) if Decimal(line['debit']) else '', s['right']),
            Paragraph(_fmt(line['credit'], currency) if Decimal(line['credit']) else '', s['right']),
            Paragraph(_fmt(line['balance'], currency), s['right']),
        ])
    story.append(_line_items_table(['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
                                   rows, widths, s))
    story.append(Spacer(1, 6 * mm))

    aging = statement.get('aging', {})
    if aging:
        labels = [('current', 'Current'), ('1_30', '1-30'), ('31_60', '31-60'), ('61_90', '61-90'),
                  ('over_90', '90+')]
        story.append(Paragraph('AMOUNT DUE BY AGE', s['section']))
        t = Table([[Paragraph(label, s['right_bold']) for _k, label in labels],
                   [Paragraph(_fmt(aging.get(k, 0), currency), s['right']) for k, _l in labels]],
                  colWidths=[usable_w / len(labels)] * len(labels))
        t.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, 0), 0.5, BRAND_GOLD)]))
        story.append(t)

    story.append(Spacer(1, 6 * mm))
    closing = Table([[Paragraph('CLOSING BALANCE', s['body_bold']),
                      Paragraph(_fmt(statement.get('closing_balance', 0), currency), s['net_pay'])]],
                    colWidths=[usable_w * 0.6, usable_w * 0.4])
    closing.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, 0), 1.5, BRAND_GOLD),
                                 ('BACKGROUND', (0, 0), (-1, -1), BRAND_LIGHT),
                                 ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7)]))
    story.append(closing)
    story.extend(_footer_paragraph(s, 'Statement'))
    doc.build(story)
    return buf.getvalue()


class PDFService:
    """
    Facade over the generators. Rental invoice downloads and invoice emails
    import `PDFService`, which previously didn't exist, so both always failed.
    """
    generate_invoice_pdf = staticmethod(generate_invoice_pdf)
    generate_receipt_pdf = staticmethod(generate_receipt_pdf)
    generate_payslip_pdf = staticmethod(generate_payslip_pdf)
    generate_statement_pdf = staticmethod(generate_statement_pdf)
    generate_account_statement_pdf = staticmethod(generate_account_statement_pdf)