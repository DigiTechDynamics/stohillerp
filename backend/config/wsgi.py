"""WSGI config for Stohill Properties."""
import os
import sys
from django.core.wsgi import get_wsgi_application


def _load_dotenv():
    """Load .env file from backend root into os.environ for WSGI."""
    try:
        from pathlib import Path
        env_path = Path(__file__).resolve().parent.parent / '.env'
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    key, _, value = line.partition('=')
                    key = key.strip()
                    value = value.strip()
                    if key not in os.environ:
                        os.environ[key] = value
    except Exception:
        pass


# Load environment variables before initializing Django
_load_dotenv()

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
application = get_wsgi_application()
