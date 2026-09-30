"""
The company's own details, used on documents, emails and the UI.

Values come from the environment (COMPANY_* settings). The reporting currency
is the Currency marked is_base in the database, falling back to
COMPANY_CURRENCY, so it always matches what the ledger reports in.

  GET core/company/    (any signed-in user, including tenant-portal users)
"""

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView


def company_profile() -> dict:
    from apps.core.models import Currency

    cfg = settings.COMPANY_CONFIG
    base = Currency.objects.filter(is_base=True).only('code', 'symbol').first()
    return {
        'name': cfg['name'],
        'tagline': cfg.get('tagline', ''),
        'address': cfg.get('address', ''),
        'phone': cfg.get('phone', ''),
        'email': cfg.get('email', ''),
        'website': cfg.get('website', ''),
        'vat_number': cfg.get('vat_number', ''),
        'tax_number': cfg.get('tax_number', ''),
        'country': cfg.get('country', ''),
        'currency': base.code if base else cfg['currency'],
        'currency_symbol': (base.symbol if base and base.symbol else cfg['currency_symbol']),
    }


def base_currency_code() -> str:
    return company_profile()['currency']


def contact_line(profile=None) -> str:
    """"Address | phone | email | website", leaving out whatever isn't set."""
    p = profile or company_profile()
    return '  |  '.join(v for v in (p['address'], p['phone'], p['email'], p['website']) if v)


def tax_line(profile=None) -> str:
    p = profile or company_profile()
    parts = []
    if p['vat_number']:
        parts.append(f"VAT No: {p['vat_number']}")
    if p['tax_number']:
        parts.append(f"TIN: {p['tax_number']}")
    return '  |  '.join(parts)


class CompanyView(APIView):
    def get(self, request):
        return Response(company_profile())
