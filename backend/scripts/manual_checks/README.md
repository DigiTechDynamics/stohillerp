# Manual checks

Legacy verification scripts that have **not yet been ported** to the pytest
suite in `backend/tests/`. They run against your local development database
(seed it first with `python manage.py seed_demo`) and print results.

Run from `backend/`:

```bash
python -m scripts.manual_checks.verify_fixed_assets
python -m scripts.manual_checks.verify_asset_disposal
python -m scripts.manual_checks.verify_allocation
python -m scripts.manual_checks.check_payroll_run
python -m scripts.manual_checks.check_dashboard
python -m scripts.manual_checks.check_dashboard_all_users
```

Some of these write data. Don't run them against production.

**Goal:** port each to `tests/` as a real assertion-based test, then delete it
here. Covered already: Zimbabwe PAYE/AIDS/NSSA, SoD rules, journal posting,
reversals, maker/checker, and the endpoint sweep.
