"""
Stohill Properties – Supabase/Lovable CMS Sync Service
=======================================================
Bidirectional sync engine: ERP is the master.

Strategy:
  - ERP → Supabase: upsert on property save / sale status change
  - Supabase → ERP: webhook endpoint can call `pull_changes()` (future)

Credentials are loaded from Django settings (sourced from .env):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PROPERTIES_TABLE
"""

import logging
import os
from decimal import Decimal

import django
from django.conf import settings

logger = logging.getLogger('stohill.integrations')


def _get_supabase_config():
    """Return (url, key, table) from settings, raise if missing."""
    url = getattr(settings, 'SUPABASE_URL', None) or os.environ.get('SUPABASE_URL')
    key = getattr(settings, 'SUPABASE_SERVICE_ROLE_KEY', None) or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    table = getattr(settings, 'SUPABASE_PROPERTIES_TABLE', 'properties')
    if not url or not key:
        raise ValueError(
            'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env / Django settings.'
        )
    return url.rstrip('/'), key, table


def _build_headers(key: str) -> dict:
    return {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }


def _property_to_payload(prop) -> dict:
    """Translate a Property ORM instance to a Supabase JSON payload."""
    primary_image_url = None
    primary_image = prop.images.filter(is_primary=True).first()
    if primary_image:
        primary_image_url = primary_image.image.url

    return {
        'erp_id': str(prop.id),
        'reference_number': prop.reference_number,
        'name': prop.name,
        'status': prop.status,
        'property_type': prop.property_type.name if prop.property_type_id else None,
        'address': prop.full_address,
        'city': prop.city,
        'suburb': prop.suburb,
        'province': prop.province,
        'country': prop.country,
        'latitude': float(prop.latitude) if prop.latitude else None,
        'longitude': float(prop.longitude) if prop.longitude else None,
        'bedrooms': prop.bedrooms,
        'bathrooms': float(prop.bathrooms) if prop.bathrooms else None,
        'garages': prop.garages,
        'parking_bays': prop.parking_bays,
        'floor_size': float(prop.floor_size) if prop.floor_size else None,
        'erf_size': float(prop.erf_size) if prop.erf_size else None,
        'asking_price': float(prop.asking_price) if prop.asking_price else None,
        'rental_rate': float(prop.rental_rate) if prop.rental_rate else None,
        'description': prop.description,
        'features': prop.features,
        'primary_image_url': primary_image_url,
        'year_built': prop.year_built,
    }


class SupabaseSyncService:
    """
    Handles all ERP → Supabase property synchronisation.
    Uses the Supabase REST API (PostgREST under the hood).
    """

    def __init__(self):
        try:
            self.url, self.key, self.table = _get_supabase_config()
            self._ready = True
        except ValueError as exc:
            logger.warning('Supabase sync disabled: %s', exc)
            self._ready = False

    # ── Public Methods ───────────────────────────────────────────────────────

    def push_property(self, prop) -> bool:
        """
        Upsert a single Property to the Supabase table.
        Matches on `erp_id` column (TEXT, unique on Supabase side).
        Returns True on success, False on failure.
        """
        if not self._ready:
            return False
        try:
            import requests as req
            payload = _property_to_payload(prop)
            endpoint = f'{self.url}/rest/v1/{self.table}'
            headers = {**_build_headers(self.key), 'Prefer': 'resolution=merge-duplicates,return=minimal'}
            response = req.post(endpoint, json=payload, headers=headers, timeout=10)
            if response.status_code not in (200, 201, 204):
                logger.error(
                    'Supabase upsert failed for property %s: %s %s',
                    prop.reference_number,
                    response.status_code,
                    response.text[:300],
                )
                return False
            logger.info('Supabase: synced property %s → %s', prop.reference_number, self.table)
            return True
        except Exception as exc:
            logger.exception('Supabase push_property error: %s', exc)
            return False

    def push_status_update(self, erp_id: int, new_status: str) -> bool:
        """
        Update only the `status` column on Supabase for a given erp_id.
        Used when a sales deal changes stage (e.g., → 'sold').
        """
        if not self._ready:
            return False
        try:
            import requests as req
            endpoint = f'{self.url}/rest/v1/{self.table}?erp_id=eq.{erp_id}'
            headers = _build_headers(self.key)
            response = req.patch(endpoint, json={'status': new_status}, headers=headers, timeout=10)
            if response.status_code not in (200, 204):
                logger.error(
                    'Supabase status update failed for erp_id=%s: %s %s',
                    erp_id,
                    response.status_code,
                    response.text[:300],
                )
                return False
            logger.info('Supabase: updated status for erp_id=%s → %s', erp_id, new_status)
            return True
        except Exception as exc:
            logger.exception('Supabase push_status_update error: %s', exc)
            return False

    def bulk_push_all(self) -> dict:
        """
        Full re-sync: push every Property to Supabase.
        Useful for initial setup or recovery.
        Returns {'pushed': N, 'failed': N}.
        """
        if not self._ready:
            return {'pushed': 0, 'failed': 0, 'error': 'Supabase not configured'}
        from apps.properties.models import Property
        pushed, failed = 0, 0
        for prop in Property.objects.select_related('property_type').prefetch_related('images').all():
            if self.push_property(prop):
                pushed += 1
            else:
                failed += 1
        logger.info('Supabase bulk sync complete: %d pushed, %d failed', pushed, failed)
        return {'pushed': pushed, 'failed': failed}


# Module-level singleton
supabase_sync = SupabaseSyncService()
