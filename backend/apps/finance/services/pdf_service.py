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
                Paragraph('<b>Currency:</b> ZiG', s['body']),
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
            [Paragraph('<b>Currency:</b> ZiG', s['body']), Paragraph('<b>Account No:</b> 00000020141255', s['body'])],
        ]
        bt = Table(bank_data, colWidths=[usable_w/2, usable_w/2])
        bt.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0)]))
        story.append(bt)

        story.extend(_footer_paragraph(s, 'Rental Invoice'))

        doc.build(story)
        return buf.getvalue()

    @staticmethod
    def generate_rent_increase_notice_pdf(lease, new_rental, effective_date) -> bytes:
        """
        Generates a professional 'Notice of Rent Increase' PDF.
        """
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        currency = lease.currency.code if lease.currency else 'USD'
        tenant_name = str(lease.tenant)
        property_name = str(lease.property.name)
        unit_number = str(lease.unit.unit_number) if lease.unit else '—'
        old_rental = lease.monthly_rental
        escalation_rate = lease.rental_escalation_rate

        # Header
        _header_block(story, s, 'NOTICE OF RENT INCREASE',
                    ref_label='Lease Ref.', ref_value=lease.lease_number,
                    date_label='Notice Date', date_value=date.today().strftime('%d %b %Y'))

        # Recipient Info
        story.append(Paragraph('RECIPIENT', s['section']))
        story.append(_info_table([
            ('Tenant:', tenant_name),
            ('Property:', property_name),
            ('Unit:', unit_number),
        ], s))
        story.append(Spacer(1, 10 * mm))

        # Formal Letter Body
        story.append(Paragraph(f"Dear {lease.tenant.first_name or 'Tenant'},", s['body_bold']))
        story.append(Spacer(1, 4 * mm))
        
        body_text = (
            f"This letter serves as formal notice regarding your lease agreement for <b>{property_name} ({unit_number})</b>. "
            f"In accordance with the terms of your agreement, an annual rental escalation of <b>{escalation_rate}%</b> "
            f"will be applied to your monthly rent."
        )
        story.append(Paragraph(body_text, s['body']))
        story.append(Spacer(1, 6 * mm))

        # Escalation Table
        story.append(Paragraph('REVISED RENTAL DETAILS', s['section']))
        usable_w = PAGE_W - 2 * MARGIN
        col_widths = [usable_w * 0.65, usable_w * 0.35]
        
        rows = [
            [Paragraph("Current Monthly Rent", s['body']), Paragraph(_fmt(old_rental, currency), s['right'])],
            [Paragraph(f"Escalation Applied ({escalation_rate}%)", s['body']), Paragraph(_fmt(new_rental - old_rental, currency), s['right'])],
            [Paragraph("New Monthly Rent", s['body_bold']), Paragraph(_fmt(new_rental, currency), s['right_bold'])],
            [Paragraph("Effective Date", s['body_bold']), Paragraph(effective_date.strftime('%d %B %Y'), s['right_bold'])],
        ]

        t = Table(rows, colWidths=col_widths)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 2), (-1, 2), BRAND_LIGHT),
            ('LINEABOVE', (0, 2), (-1, 2), 1, BRAND_GOLD),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ]))
        story.append(t)
        story.append(Spacer(1, 10 * mm))

        # Closing
        closing_text = (
            "All other terms and conditions of your existing lease agreement remain in full force and effect. "
            "Please ensure that your future payments are adjusted to reflect this new amount from the effective date mentioned above."
        )
        story.append(Paragraph(closing_text, s['body']))
        story.append(Spacer(1, 8 * mm))
        
        story.append(Paragraph("If you have any questions, please contact our Property Management department.", s['body']))
        story.append(Spacer(1, 12 * mm))
        
        story.append(Paragraph("Sincerely,", s['body']))
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph("<b>Stohill Properties Management Team</b>", s['body_bold']))

        story.extend(_footer_paragraph(s, 'Rent Increase Notice'))

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
        Generates a branded Payslip PDF matching the classic Zimbabwe layout.
        """
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm, leftMargin=15*mm, rightMargin=15*mm)
        s = _base_styles()
        story = []

        currency = payslip.payroll_run.currency.code if payslip.payroll_run and payslip.payroll_run.currency else 'USD'
        emp = payslip.employee
        contract = payslip.contract
        period_end = payslip.payroll_run.period_end.strftime('%B %Y').upper() if payslip.payroll_run else 'N/A'

        # 1. Simple Header (matches sample)
        story.append(Paragraph("STOHILL INVESTMENTS (PRIVATE LIMITED) T/A STOHILL PROPERTIES", s['body_bold']))
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"PAYSLIP FOR THE MONTH ENDED {period_end}", s['body']))
        story.append(Spacer(1, 15))

        # 2. Employee Details Block
        info_data = [
            ['Name', f": {emp.full_name}"],
            ['Position', f": {str(contract.job_position) if contract else '—'}"],
            ['Department', f": {str(emp.department) if emp.department else '—'}"],
        ]
        info_table = Table(info_data, colWidths=[30*mm, 100*mm])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,0), (-1,-1), 10),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 5))
        story.append(HRFlowable(width="100%", thickness=1, color=BRAND_DARK, spaceAfter=20))

        # 3. Earnings & Deductions (Classic 2-Column)
        all_lines = list(payslip.lines.select_related('salary_rule').all())
        earnings = [l for l in all_lines if l.category in ('basic', 'allowance')]
        deductions = [l for l in all_lines if l.category == 'deduction']

        # Pre-process rows for the main layout
        max_rows = max(len(earnings), len(deductions))
        
        body_data = []
        for i in range(max_rows):
            row = ['', '', '', '']
            if i < len(earnings):
                row[0] = earnings[i].name
                row[1] = _fmt(earnings[i].amount, currency)
            if i < len(deductions):
                row[2] = deductions[i].name
                row[3] = _fmt(deductions[i].amount, currency)
            body_data.append(row)

        # Totals logic
        gross = sum(Decimal(str(l.amount)) for l in earnings)
        total_deduc = sum(Decimal(str(l.amount)) for l in deductions)
        net = payslip.net_amount or (gross - total_deduc)

        # Layout Column Widths
        usable_w = PAGE_W - 30*mm
        c_w = [usable_w*0.35, usable_w*0.15, usable_w*0.35, usable_w*0.15]
        
        # Add a special row for totals at the bottom of the content
        footer_rows = [
            ['', '', '', ''], # Spacer
            [Paragraph('<b>Gross Earnings</b>', s['body']), Paragraph(f'<b>{_fmt(gross, currency)}</b>', s['right']), 
             Paragraph('<b>Net Salary</b>', s['body']), Paragraph(f'<b>{_fmt(net, currency)}</b>', s['right'])],
        ]
        
        full_table_data = body_data + footer_rows
        
        t = Table(full_table_data, colWidths=c_w)
        
        # Base styles for the content
        t_style = [
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('ALIGN', (1,0), (1,-1), 'RIGHT'),
            ('ALIGN', (3,0), (3,-1), 'RIGHT'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ]

        # Double underline for totals (matching sample)
        totals_idx = len(full_table_data) - 1
        t_style.extend([
            ('LINEBELOW', (1, totals_idx), (1, totals_idx), 1, BRAND_DARK),
            ('LINEBELOW', (1, totals_idx), (1, totals_idx), 1, BRAND_DARK, 0, (1, 1), 2), 
            ('LINEBELOW', (3, totals_idx), (3, totals_idx), 1, BRAND_DARK),
            ('LINEBELOW', (3, totals_idx), (3, totals_idx), 1, BRAND_DARK, 0, (1, 1), 2),
        ])
        
        t.setStyle(TableStyle(t_style))
        story.append(t)

        doc.build(story)
        return buf.getvalue()

    @staticmethod
    def generate_trial_balance_pdf(data: dict) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        _header_block(story, s, 'TRIAL BALANCE',
                    ref_label='Fiscal Period', ref_value=data.get('period', '—'))

        usable_w = PAGE_W - 2 * MARGIN
        col_widths = [usable_w * 0.5, usable_w * 0.25, usable_w * 0.25]
        
        rows = []
        for acc in data.get('accounts', []):
            dr = Decimal(str(acc.get('total_debit', 0)))
            cr = Decimal(str(acc.get('total_credit', 0)))
            rows.append([
                Paragraph(f"<b>{acc['code']}</b> {acc['name']}", s['body']),
                Paragraph(_fmt(dr) if dr > 0 else '—', s['right']),
                Paragraph(_fmt(cr) if cr > 0 else '—', s['right']),
            ])
        
        story.append(_line_items_table(['Account', 'Debit', 'Credit'], rows, col_widths, s))
        story.append(Spacer(1, 5 * mm))

        # Totals
        totals_row = [
            Paragraph('TOTALS', s['body_bold']),
            Paragraph(_fmt(data.get('total_debit', 0)), s['right_bold']),
            Paragraph(_fmt(data.get('total_credit', 0)), s['right_bold']),
        ]
        t_tot = Table([totals_row], colWidths=col_widths)
        t_tot.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BRAND_LIGHT),
            ('LINEABOVE', (0, 0), (-1, -1), 1, BRAND_GOLD),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(t_tot)

        story.extend(_footer_paragraph(s, 'Trial Balance'))
        doc.build(story)
        return buf.getvalue()

    @staticmethod
    def generate_income_statement_pdf(data: dict) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        _header_block(story, s, 'INCOME STATEMENT (P&L)',
                    ref_label='Period', ref_value=f"{data.get('from_date')} to {data.get('to_date')}")

        usable_w = PAGE_W - 2 * MARGIN
        col_widths = [usable_w * 0.7, usable_w * 0.3]

        # Revenue
        story.append(Paragraph('REVENUE', s['section']))
        rev_rows = []
        for item in data.get('revenue', []):
            rev_rows.append([Paragraph(item['name'], s['body']), Paragraph(_fmt(item['amount']), s['right'])])
        rev_rows.append([Paragraph('<b>TOTAL REVENUE</b>', s['body_bold']), Paragraph(_fmt(data.get('total_revenue', 0)), s['right_bold'])])
        
        t_rev = Table(rev_rows, colWidths=col_widths)
        t_rev.setStyle(TableStyle([
            ('LINEABOVE', (0, -1), (-1, -1), 0.5, BRAND_SLATE),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(t_rev)
        story.append(Spacer(1, 6 * mm))

        # Expenses
        story.append(Paragraph('EXPENSES', s['section']))
        exp_rows = []
        for item in data.get('expenses', []):
            exp_rows.append([Paragraph(item['name'], s['body']), Paragraph(_fmt(item['amount']), s['right'])])
        exp_rows.append([Paragraph('<b>TOTAL EXPENSES</b>', s['body_bold']), Paragraph(_fmt(data.get('total_expenses', 0)), s['right_bold'])])
        
        t_exp = Table(exp_rows, colWidths=col_widths)
        t_exp.setStyle(TableStyle([
            ('LINEABOVE', (0, -1), (-1, -1), 0.5, BRAND_SLATE),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(t_exp)
        story.append(Spacer(1, 10 * mm))

        # Net Profit
        net_profit = Decimal(str(data.get('net_profit', 0)))
        profit_label = 'NET PROFIT' if net_profit >= 0 else 'NET LOSS'
        
        res_rows = [[Paragraph(f'<b>{profit_label}</b>', s['doc_title']), Paragraph(_fmt(net_profit), s['net_pay'])]]
        t_res = Table(res_rows, colWidths=col_widths)
        t_res.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BRAND_LIGHT),
            ('LINEABOVE', (0, 0), (-1, -1), 2, BRAND_GOLD),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(t_res)

        story.extend(_footer_paragraph(s, 'Income Statement'))
        doc.build(story)
        return buf.getvalue()

    @staticmethod
    def generate_balance_sheet_pdf(data: dict) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        _header_block(story, s, 'BALANCE SHEET',
                    ref_label='As At', ref_value=data.get('as_at_date', '—'))

        usable_w = PAGE_W - 2 * MARGIN
        col_widths = [usable_w * 0.7, usable_w * 0.3]

        def _add_section(title, items, total, color=BRAND_SLATE):
            story.append(Paragraph(title.upper(), s['section']))
            rows = []
            for item in items:
                rows.append([Paragraph(item['name'], s['body']), Paragraph(_fmt(item['amount']), s['right'])])
            rows.append([Paragraph(f'<b>TOTAL {title.upper()}</b>', s['body_bold']), Paragraph(_fmt(total), s['right_bold'])])
            
            t = Table(rows, colWidths=col_widths)
            t.setStyle(TableStyle([
                ('LINEABOVE', (0, -1), (-1, -1), 0.5, color),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(t)
            story.append(Spacer(1, 6 * mm))

        _add_section('Assets', data.get('assets', []), data.get('total_assets', 0), BRAND_GOLD)
        _add_section('Liabilities', data.get('liabilities', []), data.get('total_liabilities', 0), DANGER_RED)
        _add_section('Equity', data.get('equity', []), data.get('total_equity', 0), colors.HexColor('#2563EB'))

        # Summary / Balanced Check
        story.append(Spacer(1, 4 * mm))
        is_balanced = data.get('balanced', False)
        summary_rows = [[
            Paragraph('<b>TOTAL LIABILITIES & EQUITY</b>', s['body_bold']),
            Paragraph(_fmt(Decimal(str(data.get('total_liabilities', 0))) + Decimal(str(data.get('total_equity', 0)))), s['right_bold'])
        ]]
        t_sum = Table(summary_rows, colWidths=col_widths)
        t_sum.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BRAND_LIGHT),
            ('LINEABOVE', (0, 0), (-1, -1), 1.5, BRAND_GOLD),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(t_sum)

        if not is_balanced:
            story.append(Spacer(1, 4 * mm))
            story.append(Paragraph('<b>WARNING:</b> This statement is currently out of balance.', ParagraphStyle('warn', parent=s['body'], textColor=DANGER_RED)))

        story.extend(_footer_paragraph(s, 'Balance Sheet'))
        doc.build(story)
        return buf.getvalue()

    @staticmethod
    def generate_vat_return_pdf(data: dict) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        period = data.get('period', {})
        _header_block(story, s, 'VAT RETURN REPORT',
                    ref_label='Tax Period', ref_value=f"{period.get('start_date')} to {period.get('end_date')}")

        usable_w = PAGE_W - 2 * MARGIN
        
        # Summary Grid
        story.append(Paragraph('VAT SUMMARY', s['section']))
        summary_data = [
            ['Output Tax (Sales)', _fmt(data.get('output_tax', 0))],
            ['Input Tax (Purchases)', f"({_fmt(data.get('input_tax', 0))})"],
            ['NET VAT LIABILITY', _fmt(data.get('vat_liability', 0))],
        ]
        t_sum = Table(summary_data, colWidths=[usable_w * 0.7, usable_w * 0.3])
        t_sum.setStyle(TableStyle([
            ('BACKGROUND', (0, 2), (-1, 2), BRAND_LIGHT),
            ('LINEABOVE', (0, 2), (-1, 2), 1.5, BRAND_GOLD),
            ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(t_sum)
        story.append(Spacer(1, 8 * mm))

        # Detailed Breakdown
        def _tax_detail_table(title, items, net_total):
            story.append(Paragraph(title, s['section']))
            headers = ['Tax Code', 'Gross Amount', 'Tax Amount']
            rows = []
            for item in items:
                rows.append([
                    Paragraph(f"{item.get('tax_code__code')} ({item.get('tax_code__rate')}%)", s['body']),
                    Paragraph(_fmt(item.get('total_gross', 0)), s['right']),
                    Paragraph(_fmt(item.get('total_tax', 0)), s['right_bold']),
                ])
            
            story.append(_line_items_table(headers, rows, [usable_w * 0.4, usable_w * 0.3, usable_w * 0.3], s))
            story.append(Spacer(1, 3 * mm))
            story.append(Paragraph(f"<b>Net Base Amount:</b> {_fmt(net_total)}", s['right']))
            story.append(Spacer(1, 6 * mm))

        _tax_detail_table('OUTPUT TAX DETAILS', data.get('output_details', []), data.get('total_sales_net', 0))
        _tax_detail_table('INPUT TAX DETAILS', data.get('input_details', []), data.get('total_purchases_net', 0))

        story.extend(_footer_paragraph(s, 'VAT Return'))
        doc.build(story)
        return buf.getvalue()

    @staticmethod
    def generate_ar_aging_pdf(data: list) -> bytes:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=MARGIN, bottomMargin=MARGIN, leftMargin=MARGIN, rightMargin=MARGIN)
        s = _base_styles()
        story = []

        _header_block(story, s, 'ACCOUNTS RECEIVABLE AGING',
                    ref_label='Run Date', ref_value=date.today().strftime('%d %B %Y'))

        usable_w = PAGE_W - 2 * MARGIN
        col_widths = [usable_w * 0.35, usable_w * 0.13, usable_w * 0.13, usable_w * 0.13, usable_w * 0.13, usable_w * 0.13]
        
        headers = ['Customer', 'Current', '30 Days', '60 Days', '90+ Days', 'Total']
        rows = []
        
        totals = {
            'current': Decimal('0'),
            'days_30': Decimal('0'),
            'days_60': Decimal('0'),
            'days_90_plus': Decimal('0'),
            'total': Decimal('0'),
        }

        for row in data:
            rows.append([
                Paragraph(row.get('name', '—'), s['body']),
                Paragraph(_fmt(row.get('current', 0)), s['right']),
                Paragraph(_fmt(row.get('days_30', 0)), s['right']),
                Paragraph(_fmt(row.get('days_60', 0)), s['right']),
                Paragraph(_fmt(row.get('days_90_plus', 0)), s['right']),
                Paragraph(_fmt(row.get('total', 0)), s['right_bold']),
            ])
            totals['current'] += Decimal(str(row.get('current', 0)))
            totals['days_30'] += Decimal(str(row.get('days_30', 0)))
            totals['days_60'] += Decimal(str(row.get('days_60', 0)))
            totals['days_90_plus'] += Decimal(str(row.get('days_90_plus', 0)))
            totals['total'] += Decimal(str(row.get('total', 0)))

        story.append(_line_items_table(headers, rows, col_widths, s))
        story.append(Spacer(1, 5 * mm))

        # Totals
        totals_row = [
            Paragraph('GRAND TOTALS', s['body_bold']),
            Paragraph(_fmt(totals['current']), s['right_bold']),
            Paragraph(_fmt(totals['days_30']), s['right_bold']),
            Paragraph(_fmt(totals['days_60']), s['right_bold']),
            Paragraph(_fmt(totals['days_90_plus']), s['right_bold']),
            Paragraph(_fmt(totals['total']), s['right_bold']),
        ]
        t_tot = Table([totals_row], colWidths=col_widths)
        t_tot.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BRAND_LIGHT),
            ('LINEABOVE', (0, 0), (-1, -1), 1.5, BRAND_GOLD),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(t_tot)

        story.extend(_footer_paragraph(s, 'AR Aging Report'))
        doc.build(story)
        return buf.getvalue()
