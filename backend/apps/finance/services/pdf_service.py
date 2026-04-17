"""
Stohill Properties — PDF Generation Service
Production-grade PDF engine using ReportLab.

Generates branded, professional PDFs for:
  - Customer Invoices  (generate_invoice_pdf)
  - Payslips          (generate_payslip_pdf)
  - Employee Statements (generate_statement_pdf)
"""

import io
from decimal import Decimal
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable, KeepTogether, Image
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


def _fmt(amount, currency_code='USD'):
    """Format a monetary amount."""
    try:
        val = Decimal(str(amount))
        return f"{currency_code} {val:,.2f}"
    except Exception:
        return f"{currency_code} 0.00"


def get_config(key, default=None):
    from apps.core.models import SystemConfig
    try:
        cfg = SystemConfig.objects.get(key=key)
        return cfg.value
    except SystemConfig.DoesNotExist:
        return default

def _header_block(story, s, title, ref_label='', ref_value='', date_label='Date', date_value=None):
    """Shared company header + document title block."""
    import os
    from django.conf import settings
    
    logo_path = os.path.join(settings.BASE_DIR, 'static', 'images', 'logo.png')
    logo = None
    if os.path.exists(logo_path):
        logo = Image(logo_path, width=32*mm, height=32*mm)

    company_name = get_config('COMPANY_NAME', 'Stohill Properties')
    tin = get_config('COMPANY_TIN', '2000456895')
    contact = get_config('COMPANY_CONTACT', {})
    address = get_config('COMPANY_ADDRESS', '123 Samora Machel Avenue, Harare')

    # Robustly handle contact info (could be string or dict from DB)
    contact_phone = ''
    if isinstance(contact, dict):
        contact_phone = contact.get('phone', '')
    elif isinstance(contact, str):
        contact_phone = contact

    header_data = [
        [
            logo if logo else Paragraph(company_name, s['company']),
            Paragraph(title, s['doc_title']),
        ],
        [
            Paragraph(f'<b>{company_name}</b>', s['tagline']),
            Paragraph(f'<font color="#64748B">{ref_label}</font>  <b>{ref_value}</b>' if ref_value else '', s['right']),
        ],
        [
            Paragraph(f"{address}<br/>TIN: {tin} | {contact_phone}", s['tagline']),
            Paragraph(f'{date_label}: <b>{date_value or date.today().strftime("%d %B %Y")}</b>', s['right']),
        ],
    ]
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
            f'Computer Generated {doc_type} — No Signature Required  •  Generated by Stohill ERP  •  {date.today().strftime("%d %B %Y")}',
            s['footer']
        ),
    ]


def _info_table(data, s):
    """Renders a 2-column key/value info block."""
    rows = [[Paragraph(k, s['body']), Paragraph(str(v), s['body_bold'])] for k, v in data]
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

class PDFService:
    @staticmethod
    def generate_invoice_pdf(invoice) -> bytes:
        """
        Generates a branded A4 Customer Invoice PDF using ReportLab.
        Returns bytes suitable for an HTTP response with content-type application/pdf.
        """
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        currency = invoice.currency.code if invoice.currency else 'USD'
        customer_name = str(invoice.customer)
        customer_email = getattr(getattr(invoice.customer, 'contact_link', None), 'email', '') or ''
        status = (invoice.status or '').upper()
        is_paid = status in ('PAID',)

        # Header
        _header_block(story, s, 'INVOICE',
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
                Paragraph(str(line.description), s['body']),
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
            ['Tax Total:', _fmt(invoice.tax_total, currency)],
            ['TOTAL DUE:', _fmt(invoice.total_amount, currency)],
            ['Amount Paid:', _fmt(invoice.amount_paid, currency)],
            ['BALANCE DUE:', _fmt(invoice.balance_due, currency)],
        ]
        t_rows = []
        for i, (label, value) in enumerate(totals):
            is_grand = i in (2, 4)
            style = s['body_bold'] if is_grand else s['body']
            t_rows.append([Paragraph(label, style), Paragraph(value, s['right_bold'] if is_grand else s['right'])])

        totals_table = Table(t_rows, colWidths=[usable_w * 0.78, usable_w * 0.22])
        totals_table.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LINEABOVE', (0, 2), (-1, 2), 1, BRAND_GOLD),
            ('LINEABOVE', (0, 4), (-1, 4), 2, BRAND_DARK),
            ('ROWBACKGROUNDS', (0, 2), (-1, 2), [BRAND_LIGHT]),
            ('ROWBACKGROUNDS', (0, 4), (-1, 4), [TABLE_STRIPE]),
        ]))
        story.append(totals_table)
        
        # Bank Particulars
        story.append(Spacer(1, 10 * mm))
        story.append(Paragraph('PAYMENT INSTRUCTIONS (NMB BANK)', s['section']))
        
        bank_data = [
            [
                Paragraph('<b>Account Name:</b> Stohill Properties', s['body']),
                Paragraph('<b>Account Name:</b> Stohill Properties', s['body']),
            ],
            [
                Paragraph('<b>Currency:</b> USD', s['body']),
                Paragraph('<b>Currency:</b> ZWL', s['body']),
            ],
            [
                Paragraph('<b>Account No:</b> 00000021087758', s['body']),
                Paragraph('<b>Account No:</b> 00000020141255', s['body']),
            ],
            [
                Paragraph('<b>Branch:</b> MASVINGO', s['body']),
                Paragraph('<b>Branch:</b> MASVINGO', s['body']),
            ]
        ]
        bt = Table(bank_data, colWidths=[usable_w/2, usable_w/2])
        bt.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        story.append(bt)
        
        story.extend(_footer_paragraph(s, 'Invoice'))

        doc.build(story)
        return buf.getvalue()

    @staticmethod
    def generate_rental_invoice_pdf(invoice) -> bytes:
        """
        Generates a branded A4 Rental Invoice PDF.
        Supports both Draft and Posted RentalInvoices.
        """
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        currency = invoice.currency.code if invoice.currency else 'USD'
        tenant_name = str(invoice.lease.tenant)
        property_name = str(invoice.lease.property.name)
        unit_number = str(invoice.lease.unit.unit_number) if invoice.lease.unit else '—'
        status = (invoice.status or '').upper()
        is_paid = status == 'PAID'
        is_draft = status == 'DRAFT'

        # Header
        _header_block(story, s, 'RENTAL INVOICE',
                    ref_label='Invoice No.', ref_value=invoice.invoice_number,
                    date_label='Billing Period', date_value=f"{invoice.period_start.strftime('%b %y')} - {invoice.period_end.strftime('%b %y')}")

        # Tenant + Property Info + Status watermark
        bill_data = [[
            [
                Paragraph('TENANT DETAILS', s['section']),
                _info_table([
                    ('Tenant:', tenant_name),
                    ('Property:', property_name),
                    ('Unit:', unit_number),
                    ('Due Date:', invoice.due_date.strftime('%d %B %Y')),
                ], s),
            ],
            Paragraph('DRAFT' if is_draft else ('PAID' if is_paid else 'UNPAID'), 
                      s['status_due'] if is_draft else (s['status_paid'] if is_paid else s['status_due'])),
        ]]
        col_w = [(PAGE_W - 2 * MARGIN) * 0.6, (PAGE_W - 2 * MARGIN) * 0.4]
        bt = Table(bill_data, colWidths=col_w)
        bt.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
        story.append(bt)
        story.append(Spacer(1, 8 * mm))

        # Line Items (Manual breakdown for rentals)
        story.append(Paragraph('BILLING BREAKDOWN', s['section']))
        usable_w = PAGE_W - 2 * MARGIN
        col_widths = [usable_w * 0.65, usable_w * 0.35]
        
        rows = [
            [Paragraph(f"Monthly Rent ({invoice.period_start.strftime('%B %Y')})", s['body']), Paragraph(_fmt(invoice.rental_amount, currency), s['right_bold'])],
        ]
        if invoice.vat_amount > 0:
            rows.append([Paragraph("Value Added Tax (VAT)", s['body']), Paragraph(_fmt(invoice.vat_amount, currency), s['right'])])
        if invoice.water_charges > 0:
            rows.append([Paragraph("Water & Rates Charges", s['body']), Paragraph(_fmt(invoice.water_charges, currency), s['right'])])
        if invoice.electricity_charges > 0:
            rows.append([Paragraph("Electricity Consumption", s['body']), Paragraph(_fmt(invoice.electricity_charges, currency), s['right'])])
        if invoice.late_payment_fee > 0:
            rows.append([Paragraph("Late Payment Penalty", s['body']), Paragraph(_fmt(invoice.late_payment_fee, currency), s['right'])])
        if invoice.other_charges > 0:
            rows.append([Paragraph("Sundry / Other Charges", s['body']), Paragraph(_fmt(invoice.other_charges, currency), s['right'])])

        story.append(_line_items_table(['Description', 'Amount'], rows, col_widths, s))
        story.append(Spacer(1, 6 * mm))

        # Totals box
        totals = [
            ['TOTAL AMOUNT:', _fmt(invoice.total_amount, currency)],
            ['Amount Paid:', _fmt(invoice.amount_paid, currency)],
            ['BALANCE DUE:', _fmt(invoice.balance_due, currency)],
        ]
        t_rows = []
        for i, (label, value) in enumerate(totals):
            is_grand = i in (0, 2)
            style = s['body_bold'] if is_grand else s['body']
            t_rows.append([Paragraph(label, style), Paragraph(value, s['right_bold'] if is_grand else s['right'])])

        totals_table = Table(t_rows, colWidths=[usable_w * 0.75, usable_w * 0.25])
        totals_table.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LINEABOVE', (0, 0), (-1, 0), 1, BRAND_GOLD),
            ('LINEABOVE', (0, 2), (-1, 2), 2, BRAND_DARK),
            ('ROWBACKGROUNDS', (0, 0), (-1, 0), [BRAND_LIGHT]),
            ('ROWBACKGROUNDS', (0, 2), (-1, 2), [TABLE_STRIPE]),
        ]))
        story.append(totals_table)
        
        # Payment Instructions
        story.append(Spacer(1, 10 * mm))
        story.append(Paragraph('PAYMENT INSTRUCTIONS', s['section']))
        bank_data = [
            [Paragraph('<b>Bank:</b> NMB BANK', s['body']), Paragraph('<b>Account Name:</b> Stohill Properties', s['body'])],
            [Paragraph('<b>Currency:</b> USD', s['body']), Paragraph('<b>Account No:</b> 00000021087758', s['body'])],
        ]
        bt = Table(bank_data, colWidths=[usable_w/2, usable_w/2])
        bt.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0)]))
        story.append(bt)

        story.extend(_footer_paragraph(s, 'Rental Invoice'))

        doc.build(story)
        return buf.getvalue()

    @staticmethod
    def generate_supplier_bill_pdf(invoice) -> bytes:
        """
        Generates a branded A4 Purchase Voucher PDF for a supplier invoice.
        """
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        currency = invoice.currency.code if invoice.currency else 'USD'
        supplier_name = str(invoice.supplier)
        supplier_email = getattr(invoice.supplier, 'email', '') or ''
        status = (invoice.status or '').upper()
        is_paid = status in ('PAID', 'POSTED')

        # Header
        _header_block(story, s, 'PURCHASE VOUCHER',
                    ref_label='Bill No.', ref_value=invoice.invoice_number,
                    date_label='Bill Date', date_value=invoice.invoice_date.strftime('%d %b %Y'))

        # Supplier Info + Status watermark
        bill_data = [[
            [
                Paragraph('SUPPLIER DETAILS', s['section']),
                _info_table([
                    ('Supplier:', supplier_name),
                    ('Email:', supplier_email or '—'),
                    ('Bill Date:', invoice.invoice_date.strftime('%d %B %Y')),
                    ('Due Date:', invoice.due_date.strftime('%d %B %Y')),
                    ('Reference:', invoice.reference or '—'),
                ], s),
            ],
            Paragraph('POSTED' if is_paid else 'DRAFT', s['status_paid'] if is_paid else s['status_due']),
        ]]
        col_w = [(PAGE_W - 2 * MARGIN) * 0.6, (PAGE_W - 2 * MARGIN) * 0.4]
        bt = Table(bill_data, colWidths=col_w)
        bt.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
        story.append(bt)
        story.append(Spacer(1, 8 * mm))

        # Line Items
        story.append(Paragraph('LINE ITEMS / EXPENSES', s['section']))
        usable_w = PAGE_W - 2 * MARGIN
        col_widths = [usable_w * 0.45, usable_w * 0.12, usable_w * 0.18, usable_w * 0.12, usable_w * 0.13]
        lines = invoice.lines.all() if hasattr(invoice, 'lines') else []
        rows = []
        for line in lines:
            rows.append([
                Paragraph(str(line.description), s['body']),
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
            ['Tax Total:', _fmt(invoice.tax_total, currency)],
            ['TOTAL BILL:', _fmt(invoice.total_amount, currency)],
            ['Amount Paid:', _fmt(invoice.amount_paid, currency)],
            ['OUTSTANDING:', _fmt(invoice.balance_due, currency)],
        ]
        t_rows = []
        for i, (label, value) in enumerate(totals):
            is_grand = i in (2, 4)
            style = s['body_bold'] if is_grand else s['body']
            t_rows.append([Paragraph(label, style), Paragraph(value, s['right_bold'] if is_grand else s['right'])])

        totals_table = Table(t_rows, colWidths=[usable_w * 0.78, usable_w * 0.22])
        totals_table.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LINEABOVE', (0, 2), (-1, 2), 1, BRAND_GOLD),
            ('LINEABOVE', (0, 4), (-1, 4), 2, BRAND_DARK),
            ('ROWBACKGROUNDS', (0, 2), (-1, 2), [BRAND_LIGHT]),
            ('ROWBACKGROUNDS', (0, 4), (-1, 4), [TABLE_STRIPE]),
        ]))
        story.append(totals_table)
        
        story.extend(_footer_paragraph(s, 'Purchase Voucher'))

        doc.build(story)
        return buf.getvalue()


    @staticmethod
    def generate_payslip_pdf(payslip) -> bytes:
        """
        Generates a branded Payslip PDF for a single payslip instance.
        """
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        currency = payslip.payroll_run.currency.code if payslip.payroll_run.currency else 'USD'
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
                    ('Full Name:', emp.name),
                    ('Staff ID:', emp.employee_number or '—'),
                    ('Department:', str(emp.department) if emp.department else '—'),
                    ('Job Title:', str(contract.job_position) if contract else '—'),
                ], s),
                _info_table([
                    ('Pay Period:', f"{payslip.date_from.strftime('%d %b %Y')} – {payslip.date_to.strftime('%d %b %Y')}"),
                    ('Bank:', emp.bank_name or '—'),
                    ('Account:', emp.bank_account_number or '—'),
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
                data.append([Paragraph(line.name, s['body']), Paragraph(_fmt(line.amount, currency), s['right'])])
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

    @staticmethod
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
            currency = record.get('currency', 'USD')
            rows.append([
                Paragraph(f"<b>{record.get('run_name', '—')}</b><br/><font color='#64748B' size='7'>{record.get('period', '—')}</font>", s['body']),
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
            [Paragraph('Total Gross Earned', s['body']), Paragraph(_fmt(summary.get('total_earnings', 0), 'USD'), s['right'])],
            [Paragraph('Total Deductions', s['body']), Paragraph(f"({_fmt(summary.get('total_deductions', 0), 'USD')})", ParagraphStyle('rd3', fontName='Helvetica', fontSize=9, textColor=DANGER_RED, leading=12, alignment=TA_RIGHT))],
            [Paragraph('TOTAL NET DISBURSED', s['body_bold']), Paragraph(_fmt(summary.get('total_net', 0), 'USD'), s['net_pay'])],
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
