"""The webhook ElevenLabs calls: the final transcript and summary of each conversation, and calls that never connected.

In ElevenLabs: Agents → Settings → Webhooks (post-call): URL {PUBLIC_BASE_URL}/elevenlabs/webhook, with the secret it
shows copied into ELEVEN_LABS_WEBHOOKS_SECRET. Every request is signed: header `ElevenLabs-Signature: t=<unix>,v0=<hex>`,
where v0 is HMAC-SHA256 of "<t>.<raw body>" with that secret. Anything unsigned, forged or older than 30 minutes is refused.
"""

import hashlib
import hmac
import json
import logging
import time

from fastapi import APIRouter, HTTPException, Request, Response

from app.config.settings import get_settings
from app.services.telephony.elevenlabs import sync

log = logging.getLogger(__name__)

router = APIRouter(prefix="/elevenlabs", tags=["elevenlabs"])

TOLERANCE_S = 30 * 60


def verify_signature(body: bytes, header: str | None, secret: str, now: float | None = None) -> None:
    """Raises HTTPException unless `header` is a fresh, correct signature of `body`."""
    if not secret:
        raise HTTPException(503, "ELEVEN_LABS_WEBHOOKS_SECRET isn't set on the server")
    parts = dict(p.split("=", 1) for p in (header or "").split(",") if "=" in p)
    stamp, given = parts.get("t", ""), parts.get("v0", "")
    if not stamp.isdigit() or not given:
        raise HTTPException(401, "Missing or malformed signature")
    if int(stamp) < (now or time.time()) - TOLERANCE_S:
        raise HTTPException(401, "Signature too old")
    expected = hmac.new(secret.encode(), f"{stamp}.".encode() + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(given, expected):
        raise HTTPException(401, "Bad signature")


@router.post("/webhook")
async def elevenlabs_webhook(request: Request) -> Response:
    body = await request.body()
    verify_signature(body, request.headers.get("ElevenLabs-Signature"), get_settings().eleven_labs_webhooks_secret)
    try:
        event = json.loads(body)
    except ValueError as exc:
        raise HTTPException(400, "Not JSON") from exc
    kind, data = event.get("type"), event.get("data") or {}
    log.info("ElevenLabs webhook %s for %s", kind, data.get("conversation_id"))
    if kind == "post_call_transcription":
        await sync.sync_conversation({**data, "status": data.get("status") or "done"})
    elif kind == "call_initiation_failure":
        await sync.fail_initiation(data)
    # post_call_audio and anything newer: nothing to keep, but acknowledge so ElevenLabs doesn't retry
    return Response(status_code=200)
