"""
Stohil Properties - Global Serializer Utilities
Provides SanitizedModelSerializer to protect against XSS and whitespace issues.
"""
from rest_framework import serializers
from django.utils.html import strip_tags

class SanitizedModelSerializer(serializers.ModelSerializer):
    """
    Base serializer that sanitizes all incoming data.
    - Trims whitespace from CharFields and TextFields.
    - Strips HTML tags to prevent XSS.
    
    Usage:
    class MySerializer(SanitizedModelSerializer):
        class Meta:
            model = MyModel
            fields = '__all__'
            # Optional: exclude specific fields from HTML stripping
            # (still trimmed)
            non_sanitized_fields = ['body', 'rich_text']
    """
    
    def to_internal_value(self, data):
        """
        Perform global sanitization before DRF validation.
        """
        # Create a mutable copy of the data if it's a QueryDict
        if hasattr(data, 'dict'):
            data = data.dict()
        else:
            data = data.copy() if isinstance(data, dict) else data

        non_sanitized = getattr(self.Meta, 'non_sanitized_fields', [])

        for key, value in data.items():
            if isinstance(value, str):
                # 1. Trimming (Always)
                cleaned_value = value.strip()
                
                # 2. HTML Stripping (unless excluded)
                if key not in non_sanitized:
                    cleaned_value = strip_tags(cleaned_value)
                
                data[key] = cleaned_value

        return super().to_internal_value(data)
