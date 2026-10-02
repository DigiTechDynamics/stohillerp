"""
Provider hooks for outside services. Each defaults to a manual adapter that
records the workflow without calling anyone; a real provider is a class with
the same methods, selected by its dotted path in settings:

  CREDIT_BUREAU_BACKEND   request(application) -> reference; results recorded via record_credit_result
  SIGNATURE_BACKEND       send(lease, signer_email) -> reference
  CPI_FEED_BACKEND        latest() -> [(month_date, value)]
"""

from django.conf import settings
from django.utils.module_loading import import_string


class ManualCreditBureau:
    """No bureau connected: the check is marked pending and staff record the result they obtained."""
    name = 'manual'

    def request(self, application):
        return ''


class ManualSignature:
    """No e-signature service: the lease is marked sent; staff mark it signed when the signed copy is back."""
    name = 'manual'

    def send(self, lease, signer_email):
        return ''


class ManualCPIFeed:
    """CPI figures are entered by hand under Rental Management > CPI."""
    name = 'manual'

    def latest(self):
        return []


def _backend(setting, default):
    return import_string(getattr(settings, setting, default))()


def credit_bureau():
    return _backend('CREDIT_BUREAU_BACKEND', 'apps.propman.integrations.ManualCreditBureau')


def signature_service():
    return _backend('SIGNATURE_BACKEND', 'apps.propman.integrations.ManualSignature')


def cpi_feed():
    return _backend('CPI_FEED_BACKEND', 'apps.propman.integrations.ManualCPIFeed')
