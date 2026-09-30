"""Shared serializer helpers."""

from utils.permissions import user_modules


class SensitiveFieldsMixin:
    """
    Drop personal fields for users whose modules only need the record as a
    lookup (e.g. an agent picking an employee, finance picking a contact).

    Set `sensitive_fields` and `sensitive_modules` (modules that may see them).
    """
    sensitive_fields = ()
    sensitive_modules = set()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not user.is_authenticated or user.is_superuser:
            return data
        if not (user_modules(user) & self.sensitive_modules):
            for field in self.sensitive_fields:
                data.pop(field, None)
        return data
