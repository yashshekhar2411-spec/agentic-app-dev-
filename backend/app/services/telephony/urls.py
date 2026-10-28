from urllib.parse import urlencode

from app.config.settings import get_settings


def public_url(path: str, **params: str) -> str:
    """A URL on this server that the phone provider (Twilio, ValueFirst) can call back."""
    base = get_settings().public_base_url.rstrip("/") + path
    return f"{base}?{urlencode(params)}" if params else base
