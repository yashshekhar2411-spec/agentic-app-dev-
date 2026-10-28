"""Outgoing Twilio legs. connect_human rings a human's phone, reads them the AI brief, then dials into the
caller's hold queue so the two are joined. dial_customer rings a customer so the AI can talk to them."""

import asyncio
from functools import lru_cache

from twilio.rest import Client
from twilio.twiml.voice_response import Dial, VoiceResponse

from app.config.settings import get_settings
from app.features.calls.models import Call
from app.features.profile.models import Human
from app.services.telephony.urls import public_url


def queue_name(call: Call) -> str:
    return call.id


def human_leg_twiml(call: Call, summary: str) -> str:
    s = get_settings()
    response = VoiceResponse()
    response.say(f"Incoming handoff from the AI assistant. {summary} Connecting you now.", voice=s.tts_voice)
    dial = Dial()
    dial.queue(queue_name(call))
    response.append(dial)
    return str(response)


@lru_cache
def _client(account_sid: str, auth_token: str) -> Client:
    # Reused so handoffs share one HTTP session (keep-alive) instead of a fresh TLS handshake each time
    return Client(account_sid, auth_token)


def twilio_configured() -> bool:
    s = get_settings()
    return bool(s.twilio_account_sid and s.twilio_auth_token and s.twilio_phone_number)


def _twilio() -> Client:
    s = get_settings()
    if not twilio_configured():
        raise RuntimeError("Twilio is not configured")
    return _client(s.twilio_account_sid, s.twilio_auth_token)


async def connect_human(call: Call, human: Human, summary: str) -> None:
    s = get_settings()
    client = _twilio()
    await asyncio.to_thread(
        client.calls.create,
        to=human.phone,
        from_=s.twilio_phone_number,
        twiml=human_leg_twiml(call, summary),
    )


async def dial_customer(call: Call) -> str:
    """Rings call.from_number. When they pick up, Twilio fetches /twilio/outbound and the AI starts talking.
    Returns the Twilio call SID."""
    s = get_settings()
    created = await asyncio.to_thread(
        _twilio().calls.create,
        to=call.from_number,
        from_=s.twilio_phone_number,
        url=public_url("/twilio/outbound", call_id=call.id),
        # call_id in the URL: a failed or unanswered call can report back before its SID is stored
        status_callback=public_url("/twilio/status", call_id=call.id),
        status_callback_event=["completed"],
        # No `timeout`: trial accounts reject it. Twilio rings for its default 60 seconds.
    )
    return created.sid


async def hang_up(call: Call) -> None:
    if call.twilio_call_sid:
        await asyncio.to_thread(_twilio().calls(call.twilio_call_sid).update, status="completed")
