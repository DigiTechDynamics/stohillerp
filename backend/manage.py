#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def _load_dotenv():
    """Load .env file from backend root into os.environ."""
    try:
        from pathlib import Path
        env_path = Path(__file__).resolve().parent / '.env'
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    key, _, value = line.partition('=')
                    key = key.strip()
                    value = value.strip()
                    # Only set if not already in environment (respect system overrides)
                    if key not in os.environ:
                        os.environ[key] = value
    except Exception:
        pass  # Never fail -- .env is optional in production


def main():
    _load_dotenv()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError("Couldn't import Django.") from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
