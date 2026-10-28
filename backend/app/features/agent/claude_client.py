"""One shared Claude client per process, so every call reuses the same connection pool."""

from functools import lru_cache

import anthropic

from app.config.settings import get_settings


@lru_cache
def get_client() -> anthropic.AsyncAnthropic:
    s = get_settings()
    # One retry with a timeout that fits inside a caller turn; the orchestrator hands off if it still fails
    return anthropic.AsyncAnthropic(
        api_key=s.anthropic_api_key or None,
        timeout=s.agent_turn_timeout_s,
        max_retries=1,
    )


async def close_client() -> None:
    if get_client.cache_info().currsize:
        await get_client().close()
        get_client.cache_clear()
