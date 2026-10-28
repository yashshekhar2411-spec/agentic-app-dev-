"""Push notifications to human agents' phones via Expo's push service."""

import asyncio
import logging

import httpx

from app.features.calls.models import Call
from app.features.handoff.models import Handoff
from app.features.profile.models import Human

log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_BATCH = 100  # Expo accepts at most 100 messages per request

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    # Shared so every handoff reuses the same pooled connection to Expo
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10)
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def _send(batch: list[dict]) -> None:
    try:
        res = await _get_client().post(EXPO_PUSH_URL, json=batch)
        res.raise_for_status()
    except httpx.HTTPError:
        log.exception("push notification failed")


async def notify_humans(humans: list[Human], handoff: Handoff, call: Call) -> None:
    messages = [
        {
            "to": h.push_token,
            "title": "Caller needs a human" + (" (urgent)" if handoff.urgency == "high" else ""),
            "body": handoff.summary[:180],
            "data": {"handoffId": handoff.id, "callId": call.id},
            "priority": "high",
            "sound": "default",
        }
        for h in humans
        if h.push_token
    ]
    if messages:
        await asyncio.gather(*(_send(messages[i : i + EXPO_BATCH]) for i in range(0, len(messages), EXPO_BATCH)))
