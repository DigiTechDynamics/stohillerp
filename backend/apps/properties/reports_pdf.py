"""Inspection report PDF (company header from the finance PDF service)."""

import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.finance.services.pdf_service import (
    BRAND_GOLD, MARGIN, PAGE_W, TABLE_STRIPE, _base_styles, _fmt, _footer_paragraph, _header_block,
)


def inspection_pdf(inspection) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN,
                            bottomMargin=MARGIN)
    s = _base_styles()
    story = []
    _header_block(story, s, f'{inspection.get_inspection_type_display().upper()}',
                  ref_label='Property', ref_value=inspection.property.reference_number,
                  date_label='Inspected',
                  date_value=(inspection.completed_date or inspection.scheduled_date).strftime('%d %B %Y'))

    space = inspection.property.name + (f', unit {inspection.unit.unit_number}' if inspection.unit_id else '')
    tenant = inspection.lease.tenant.full_name if inspection.lease_id and inspection.lease.tenant_id else '—'
    info = [['Property', space], ['Address', inspection.property.full_address], ['Tenant', tenant],
            ['Lease', inspection.lease.lease_number if inspection.lease_id else '—'],
            ['Inspector', inspection.inspector.full_name if inspection.inspector_id else '—'],
            ['Overall condition', f'{inspection.condition_rating}/10' if inspection.condition_rating else '—'],
            ['Status', inspection.get_status_display()]]
    t = Table([[Paragraph(k, s['body']), Paragraph(escape(str(v)), s['body_bold'])] for k, v in info],
              colWidths=[45 * mm, 120 * mm])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
    story += [t, Spacer(1, 6 * mm)]

    rows = [[Paragraph(h, s['body_bold']) for h in ('Area', 'Item', 'Condition', 'Notes', 'Repair cost')]]
    for item in inspection.items.all():
        rows.append([Paragraph(escape(item.area), s['body']), Paragraph(escape(item.item), s['body']),
                     Paragraph(item.get_condition_display(), s['body']), Paragraph(escape(item.notes or ''), s['body']),
                     Paragraph(_fmt(item.repair_cost) if item.repair_cost else '', s['right'])])
    width = PAGE_W - 2 * MARGIN
    items = Table(rows, colWidths=[width * w for w in (0.18, 0.22, 0.14, 0.31, 0.15)], repeatRows=1)
    items.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 1, BRAND_GOLD),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story += [Paragraph('CHECKLIST', s['section']), items]
    if inspection.damage_total:
        story += [Spacer(1, 3 * mm), Paragraph(f'Total repair costs: <b>{_fmt(inspection.damage_total)}</b>', s['body'])]
    for title, text in (('FINDINGS', inspection.findings), ('ACTION REQUIRED', inspection.action_required)):
        if text:
            story += [Paragraph(title, s['section']), Paragraph(escape(text).replace('\n', '<br/>'), s['body'])]
    story += [Spacer(1, 14 * mm),
              Paragraph('Tenant signature: ______________________   Inspector signature: ______________________',
                        s['body'])]
    story += _footer_paragraph(s, 'Inspection Report')
    doc.build(story)
    return buf.getvalue()
