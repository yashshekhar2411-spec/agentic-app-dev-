"""Twilio voice webhooks. Point your Twilio number's "A call comes in" to POST {PUBLIC_BASE_URL}/twilio/voice
and "Call status changes" to POST {PUBLIC_BASE_URL}/twilio/status.

Flow: greet -> <Gather speech> -> AI reply -> ... -> (handoff) <Enqueue> on hold -> human dials the queue,
or after HOLD_TIMEOUT_S the caller leaves voicemail.

Outbound calls (POST /calls/outbound) set their own URLs: /twilio/outbound when the customer picks up
(the AI speaks first), then the same /gather loop as an inbound call.
"""

import logging
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from twilio.request_validator import RequestValidator
from twilio.twiml.voice_response import Gather, VoiceResponse

from app.features.agent.orchestrator import add_turn, handle_caller_turn
from app.features.agent.prompts import greeting, outbound_greeting
from app.config.settings import get_settings
from app.services.realtime.bus import bus
from app.features.handoff import service as handoff_service
from app.features.calls.models import Call, CallDirection, CallStatus, Speaker
from app.storage.store import StoreConflict, store
from app.services.telephony.twilio.calls import queue_name
from app.services.telephony.urls import public_url as _url

log = logging.getLogger(__name__)

NOT_REACHED = {
    "busy": "The line was busy.",
    "no-answer": "Nobody answered.",
    "failed": "The call couldn't be placed (check the number).",
    "canceled": "The call was cancelled before it was answered.",
}

HOLD_MUSIC = "http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3"


@lru_cache
def _validator(auth_token: str) -> RequestValidator:
    return RequestValidator(auth_token)


async def verify_twilio(request: Request) -> dict[str, str]:
    """Reject webhooks that weren't signed by Twilio. Returns the form fields."""
    form = {k: str(v) for k, v in (await request.form()).items()}
    s = get_settings()
    if s.validate_twilio_signature and s.twilio_auth_token:
        url = s.public_base_url.rstrip("/") + request.url.path
        if request.url.query:
            url += "?" + request.url.query
        signature = request.headers.get("X-Twilio-Signature", "")
        if not _validator(s.twilio_auth_token).validate(url, form, signature):
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    return form


router = APIRouter(prefix="/twilio", tags=["twilio"])


def _xml(response: VoiceResponse) -> Response:
    return Response(content=str(response), media_type="application/xml")


def _say_and_listen(call: Call, text: str) -> VoiceResponse:
    s = get_settings()
    response = VoiceResponse()
    gather = Gather(
        input="speech",
        action=_url("/twilio/gather", call_id=call.id),
        speech_timeout="auto",
        action_on_empty_result=True,
        language=s.call_language,
    )
    gather.say(text, voice=s.tts_voice)  # inside Gather so the caller can interrupt
    response.append(gather)
    return response


async def _get_call(call_id: str) -> Call:
    call = await store.get_call(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Unknown call")
    return call


@router.post("/voice")
async def incoming_call(form: dict = Depends(verify_twilio)) -> Response:
    sid = form.get("CallSid")
    try:
        call = await store.add_call(Call(from_number=form.get("From", "unknown"), twilio_call_sid=sid))
    except StoreConflict:
        # Twilio retried the webhook: greet again on the call we already started
        existing = await store.call_by_sid(sid or "")
        if existing is None:
            raise
        return _xml(_say_and_listen(existing, greeting()))
    await bus.publish("call.started", {"call": call.to_wire()})
    text = greeting()
    await add_turn(call, Speaker.AI, text)
    return _xml(_say_and_listen(call, text))


@router.post("/outbound")
async def outbound_answered(call_id: str, form: dict = Depends(verify_twilio)) -> Response:
    """The customer we dialled (POST /calls/outbound) picked up: the AI opens the conversation."""
    call = await _get_call(call_id)
    if call.status != CallStatus.AI_ACTIVE:
        response = VoiceResponse()
        response.hangup()  # the agent hung up from the app while it was ringing
        return _xml(response)
    opener = next((t.text for t in call.transcript if t.speaker == Speaker.AI), None)
    if opener is None:
        opener = outbound_greeting(call.purpose)
        await add_turn(call, Speaker.AI, opener)
    # else: Twilio retried the webhook, say the same opener again
    return _xml(_say_and_listen(call, opener))


@router.post("/gather")
async def caller_spoke(call_id: str, form: dict = Depends(verify_twilio)) -> Response:
    call = await _get_call(call_id)
    s = get_settings()
    reply = await handle_caller_turn(call, form.get("SpeechResult", ""))

    if reply.handoff_reason:
        await handoff_service.start_handoff(call, reply)
        response = VoiceResponse()
        response.say(reply.text, voice=s.tts_voice)
        response.enqueue(
            queue_name(call),
            wait_url=_url("/twilio/hold", call_id=call.id),
            action=_url("/twilio/queue-done", call_id=call.id),
        )
        return _xml(response)

    if reply.end_call:
        response = VoiceResponse()
        response.say(reply.text, voice=s.tts_voice)
        response.hangup()
        return _xml(response)

    return _xml(_say_and_listen(call, reply.text))


@router.post("/hold")
async def hold(call_id: str, form: dict = Depends(verify_twilio)) -> Response:
    """Twilio calls this repeatedly while the caller waits in the queue."""
    s = get_settings()
    response = VoiceResponse()
    if int(form.get("QueueTime", "0")) >= s.hold_timeout_s:
        response.leave()  # -> /queue-done with QueueResult=leave -> voicemail
        return _xml(response)
    response.say("Thanks for holding. A team member will be with you shortly.", voice=s.tts_voice)
    response.play(HOLD_MUSIC)
    return _xml(response)


@router.post("/queue-done")
async def queue_done(call_id: str, form: dict = Depends(verify_twilio)) -> Response:
    """Caller left the hold queue: bridged to a human, timed out, or hung up."""
    call = await _get_call(call_id)
    s = get_settings()
    response = VoiceResponse()
    if form.get("QueueResult") == "leave":
        response.say(
            "Sorry, everyone is busy right now. Please leave a message after the beep and we'll call you back.",
            voice=s.tts_voice,
        )
        response.record(max_length=120, play_beep=True, action=_url("/twilio/voicemail", call_id=call.id))
    else:
        response.hangup()
    return _xml(response)


@router.post("/voicemail")
async def voicemail(call_id: str, form: dict = Depends(verify_twilio)) -> Response:
    call = await _get_call(call_id)
    call.voicemail_url = form.get("RecordingUrl")
    await handoff_service.end_call(call, CallStatus.VOICEMAIL)
    response = VoiceResponse()
    response.say("Thank you. We'll call you back soon. Goodbye.", voice=get_settings().tts_voice)
    response.hangup()
    return _xml(response)


@router.post("/status")
async def call_status(call_id: str | None = None, form: dict = Depends(verify_twilio)) -> Response:
    """Inbound calls: set on the Twilio number. Outbound calls: set per call, with call_id in the URL."""
    if form.get("CallStatus") in {"completed", "busy", "failed", "no-answer", "canceled"}:
        call = await store.get_call(call_id) if call_id else await store.call_by_sid(form.get("CallSid", ""))
        if call:
            if call.direction == CallDirection.OUTBOUND and form.get("CallStatus") != "completed":
                await add_turn(call, Speaker.SYSTEM, NOT_REACHED.get(form["CallStatus"], "The call didn't connect."))
            await handoff_service.end_call(call)
    return Response(status_code=204)
