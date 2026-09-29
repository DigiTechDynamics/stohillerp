"""Stohill Properties - API pagination."""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsPagination(PageNumberPagination):
    """
    Page-number pagination with a stable ordering guarantee.

    Response shape (the frontend's Pagination component depends on it):
        {count, total_pages, current_page, next, previous, results}
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200

    def paginate_queryset(self, queryset, request, view=None):
        # Without ORDER BY, PostgreSQL may return rows in a different order for
        # each page query, so users see duplicates or miss records. Views that
        # set an ordering keep it; unordered ones fall back to newest-first,
        # with pk as a tie-breaker so the order is fully deterministic.
        if hasattr(queryset, "ordered") and not queryset.ordered:
            field_names = {f.name for f in queryset.model._meta.get_fields()}
            ordering = ["-created_at", "-pk"] if "created_at" in field_names else ["-pk"]
            queryset = queryset.order_by(*ordering)
        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data):
        return Response({
            "count": self.page.paginator.count,
            "total_pages": self.page.paginator.num_pages,
            "current_page": self.page.number,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "results": data,
        })
