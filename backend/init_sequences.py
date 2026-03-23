import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.services.number_sequence import NumberSequenceService

def init():
    print("Initializing Number Sequences...")
    NumberSequenceService.initialize_default_sequences()
    print("Initialization complete.")

if __name__ == "__main__":
    init()
