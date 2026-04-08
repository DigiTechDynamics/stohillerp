import os
import django
import sys
from decimal import Decimal
from datetime import date, timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.rentals.tests.test_lease_lifecycle import LeaseLifecycleTests

# Mock a simple TestCase context (manual)
class ManualTestContext:
    def assertEqual(self, val1, val2):
        assert val1 == val2, f"{val1} != {val2}"
    def assertIsNotNone(self, val):
        assert val is not None, f"Expected not None"
    def assertIn(self, item, container):
        assert item in container, f"Expected {item} in {container}"
    def assertRaises(self, exc_class):
        class Handler:
            def __enter__(self): return self
            def __exit__(self, exc_type, exc_val, exc_tb):
                if not exc_type or not issubclass(exc_type, exc_class):
                    raise Exception(f"Expected {exc_class}, got {exc_type}")
                self.exception = exc_val
                return True
        return Handler()

# Run the tests
test_case = LeaseLifecycleTests()
# Mix in the manual assertion methods
for m in dir(ManualTestContext):
    if not m.startswith('__'):
        setattr(test_case, m, getattr(ManualTestContext(), m))

try:
    print("Running setup...")
    test_case.setUp()
    
    print("Running test_lease_activation_updates_unit...")
    test_case.test_lease_activation_updates_unit()
    print("SUCCESS")
    
    print("\nRunning test_overlapping_active_leases_prevented...")
    test_case.test_overlapping_active_leases_prevented()
    print("SUCCESS")
    
    print("\nRunning test_calculate_next_invoice_date...")
    test_case.test_calculate_next_invoice_date()
    print("SUCCESS")
    
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    try:
        test_case.tearDown()
    except:
        pass
