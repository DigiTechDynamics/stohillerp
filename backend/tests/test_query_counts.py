"""
N+1 guard: a list endpoint must run about the same number of queries for one
row as for a full page. Each endpoint in the API sweep is fetched with
page_size=1 and page_size=30; when the page has several rows, the query count
may grow by at most a small constant, not by one or more queries per row.
"""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from tests.test_api_smoke import API_URLS

pytestmark = [pytest.mark.django_db, pytest.mark.smoke]

# Extra queries tolerated between a 1-row and a 30-row page (e.g. a second
# prefetch kicking in once there is data for it).
SLACK = 2


def _rows(response):
    data = getattr(response, 'data', None)
    rows = data.get('results') if isinstance(data, dict) else data
    return rows if isinstance(rows, list) else None


def test_list_endpoints_do_not_query_per_row(auth_client, superuser):
    client = auth_client(superuser)
    offenders = []
    for url in API_URLS:
        counts, sizes = [], []
        for size in (1, 30):
            with CaptureQueriesContext(connection) as ctx:
                response = client.get(url, {'page_size': size})
            rows = _rows(response) if response.status_code == 200 else None
            sizes.append(len(rows) if rows is not None else 0)
            counts.append(len(ctx.captured_queries))
        if sizes[0] == 1 and sizes[1] > 2 and counts[1] - counts[0] > SLACK:
            offenders.append(f'{url}: {counts[0]} queries for 1 row, {counts[1]} for {sizes[1]}')
    assert not offenders, 'Per-row queries:\n' + '\n'.join(offenders)
