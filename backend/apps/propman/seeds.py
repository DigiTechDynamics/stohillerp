"""Default arrears stages (idempotent; administrators can edit them afterwards)."""

from apps.propman.models import ArrearsStage

DEFAULT_STAGES = [
    (10, 'Friendly reminder', 3, 'reminder', True, True,
     'Rent overdue: {lease}',
     'Dear {tenant},\n\nOur records show {currency} {amount} is overdue on lease {lease} ({property}), '
     'now {days} days past the due date. If you have already paid, please ignore this message; otherwise '
     'kindly settle the balance or contact us.\n\nRegards,\n{company}'),
    (20, 'Letter of demand', 14, 'letter', True, True,
     'Letter of demand: lease {lease}',
     'Dear {tenant},\n\nDespite our reminder, {currency} {amount} remains unpaid on lease {lease} ({property}), '
     '{days} days overdue. Please pay the full amount within 7 days of this letter, or contact us to arrange '
     'payment. Failure to do so may result in further action in terms of your lease.\n\n{company}'),
    (30, 'Final demand', 30, 'final', True, True,
     'FINAL DEMAND: lease {lease}',
     'Dear {tenant},\n\nThis is a final demand for {currency} {amount}, {days} days overdue on lease {lease} '
     '({property}). Unless payment is received within 7 days, the matter will be handed to our attorneys '
     'for collection and you may be liable for the legal costs.\n\n{company}'),
    (40, 'Hand over to attorneys', 45, 'legal', False, False,
     'Arrears handed over: lease {lease}',
     'Lease {lease} ({property}): {currency} {amount} is {days} days overdue and is ready for legal handover.'),
]


def seed_arrears_stages():
    if ArrearsStage.objects.exists():
        return
    for seq, name, days, action, email, sms, subject, template in DEFAULT_STAGES:
        ArrearsStage.objects.create(sequence=seq, name=name, days_overdue=days, action=action, send_email=email,
                                    send_sms=sms, subject=subject, template=template)
