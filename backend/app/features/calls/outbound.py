"""Places an outbound AI call through whichever provider CALL_PROVIDER picks. Used by the app's Call button and
by scheduled calls (app/features/schedule/runner.py)."""

import logging

from twilio.base.exceptions import TwilioRestException

from app.config.settings import get_settings
from app.features.agent.orchestrator import add_turn
from app.features.calls.models import Call, CallDirection, Speaker
from app.features.contacts.store import contacts
from app.features.handoff import service as handoff_service
from app.services.realtime.bus import bus
from app.services.telephony.elevenlabs import client as elevenlabs, sync as elevenlabs_sync
from app.services.telephony.twilio import calls as twilio
from app.services.telephony.valuefirst import calls as valuefirst
from app.storage.store import store

log = logging.getLogger(__name__)


class OutboundError(Exception):
    """The call couldn't be placed. `status` is the HTTP status the API answers with."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def check_ready(to: str) -> None:
    """Raise OutboundError if a call to `to` can't be placed right now (nothing is created)."""
    s = get_settings()
    provider = s.call_provider.lower()
    if contacts.is_blocked(to):
        raise OutboundError(403, f"{to} is on your do-not-call list: unblock it in Contacts to call it")
    if provider == "elevenlabs" and not elevenlabs.configured():
        raise OutboundError(503, "ElevenLabs isn't set up on the server: fill in ELEVEN_LABS_* in backend/.env")
    if provider == "valuefirst" and not valuefirst.configured():
        raise OutboundError(503, "ValueFirst isn't set up on the server: fill in VALUEFIRST_* in backend/.env")
    if provider == "twilio" and not twilio.twilio_configured():
        raise OutboundError(503, "Twilio isn't set up on the server: fill in TWILIO_* in backend/.env")
    if provider != "elevenlabs" and ("localhost" in s.public_base_url or "127.0.0.1" in s.public_base_url):
        raise OutboundError(503, "PUBLIC_BASE_URL must be a public URL the phone provider can reach (e.g. your tunnel URL)")


async def place_outbound(to: str, purpose: str) -> Call:
    """Ring a customer's phone; when they pick up the AI starts the conversation."""
    check_ready(to)
    provider = get_settings().call_provider.lower()
    call = await store.add_call(Call(from_number=to, direction=CallDirection.OUTBOUND, purpose=purpose.strip()))
    await bus.publish("call.started", {"call": call.to_wire()})
    try:
        if provider == "elevenlabs":
            # Not a Twilio SID: ElevenLabs's conversation id (see sync.py), so it's never sent to Twilio
            conversation_id = await elevenlabs.place_call(call)
            call.twilio_call_sid = f"{elevenlabs_sync.SID}{conversation_id}" if conversation_id else f"{elevenlabs_sync.PENDING}{call.id}"
        elif provider == "valuefirst":
            # Not a Twilio SID: ValueFirst's request id, kept so the app treats this as a real phone call
            call.twilio_call_sid = f"vf:{await valuefirst.dial_customer(call)}"
        else:
            call.twilio_call_sid = await twilio.dial_customer(call)
    except (TwilioRestException, valuefirst.ValueFirstError, elevenlabs.ElevenLabsError) as exc:
        detail = exc.msg if isinstance(exc, TwilioRestException) else str(exc)
        log.warning("outbound call to %s failed: %s", to, detail)
        await add_turn(call, Speaker.SYSTEM, f"Couldn't place the call: {detail}")
        await handoff_service.end_call(call)
        name = {"elevenlabs": "ElevenLabs", "valuefirst": "ValueFirst"}.get(provider, "Twilio")
        # 424, not 502: tunnels and proxies replace a 502's body with their own page, hiding this message
        raise OutboundError(424, f"{name} couldn't place the call: {detail}") from exc
    await store.update_call(call, "twilio_call_sid")
    await bus.publish("call.updated", {"call": call.to_wire()})
    return call
