from apps.core.models import NumberSequence
from django.db import transaction

class NumberSequenceService:
    @staticmethod
    def get_next_number(sequence_name, prefix="", padding=4):
        """
        Gets the next number in a sequence. 
        If it doesn't exist, it creates it with the given prefix and padding.
        """
        with transaction.atomic():
            sequence, created = NumberSequence.objects.select_for_update().get_or_create(
                name=sequence_name,
                defaults={
                    'prefix': prefix,
                    'padding': padding,
                    'is_active': True
                }
            )
            return sequence.get_next()

    @classmethod
    def initialize_default_sequences(cls):
        """Initializes standard sequences if they don't exist."""
        cls.get_next_number("Journal Entry", prefix="JNL-", padding=6)
        cls.get_next_number("Supplier Invoice", prefix="PINV-", padding=5)
        cls.get_next_number("Supplier Payment", prefix="PAY-", padding=5)
        cls.get_next_number("Customer Invoice", prefix="SINV-", padding=5)
        cls.get_next_number("Customer Receipt", prefix="REC-", padding=5)
        cls.get_next_number("Property Reference", prefix="PROP-", padding=4)
        cls.get_next_number("Employee", prefix="EMP-", padding=4)
