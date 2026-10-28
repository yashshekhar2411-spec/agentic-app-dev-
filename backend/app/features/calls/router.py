import logging

from fastapi import APIRouter, Depends, HTTPException
from twilio.base.exceptions import TwilioRestException

from app.features.auth.rbac import require
from app.config.settings import get_settings
from app.features.calls.models import Call, CallNotesUpdate, CallStatus, OutboundCallRequest
from app.features.calls.outbound import OutboundError, place_outbound
from app.features.handoff import service as handoff_service
from app.services.realtime.bus import bus
from app.services.telephony.elevenlabs import sync as elevenlabs_sync
from app.services.telephony.twilio import calls as twilio
from app.storage.store import store

log = logging.getLogger(__name__)

router = APIRouter(prefix="/calls", tags=["calls"])


@router.get("", response_model=list[Call], dependencies=[Depends(require("calls.view"))])
async def list_calls(status: CallStatus | None = None) -> list[Call]:
    return await store.list_calls(status, limit=get_settings().history_limit)


@router.post("/outbound", response_model=Call, dependencies=[Depends(require("dialer.call"))])
async def start_outbound_call(body: OutboundCallRequest) -> Call:
    """Ring a customer's phone; when they pick up the AI starts the conversation."""
    try:
        return await place_outbound(body.to, body.purpose)
    except OutboundError as exc:
        raise HTTPException(exc.status, exc.detail) from exc


@router.get("/{call_id}", response_model=Call, dependencies=[Depends(require("calls.view"))])
async def get_call(call_id: str) -> Call:
    call = await store.get_call(call_id)
    if call is None:
        raise HTTPException(404, "Call not found")
    return call


@router.patch("/{call_id}", response_model=Call, dependencies=[Depends(require("calls.notes"))])
async def update_call_notes(call_id: str, body: CallNotesUpdate) -> Call:
    """Notes, tags and the outcome an agent records for a call (during it or afterwards)."""
    call = await store.get_call(call_id)
    if call is None:
        raise HTTPException(404, "Call not found")
    changes = body.model_dump(exclude_unset=True)
    if "notes" in changes:
        call.notes = (body.notes or "").strip()
    if "tags" in changes:
        # Short, lower-case and de-duplicated, in the order given
        call.tags = list(dict.fromkeys(t.strip().lower()[:30] for t in body.tags or [] if t.strip()))
    if "disposition" in changes:
        call.disposition = body.disposition
    fields = [f for f in ("notes", "tags", "disposition") if f in changes]
    await store.update_call(call, *fields)
    await bus.publish("call.updated", {"call": call.to_wire()})
    return call


@router.post("/{call_id}/hangup", response_model=Call, dependencies=[Depends(require("calls.hangup"))])
async def hang_up_call(call_id: str) -> Call:
    """End a live phone call from the app (Twilio drops the line, then the call is marked ended)."""
    call = await store.get_call(call_id)
    if call is None:
        raise HTTPException(404, "Call not found")
    if elevenlabs_sync.is_elevenlabs(call) and call.ended_at is None:
        # ElevenLabs has no way to hang up a phone call from outside: the AI ends it, or the customer does
        raise HTTPException(409, "This call is run by ElevenLabs: it can't be hung up from here. The AI ends it, or the customer hangs up.")
    # ValueFirst has no hang-up API here: the call is just marked ended
    if call.ended_at is None and call.twilio_call_sid and not call.twilio_call_sid.startswith("vf:"):
        try:
            await twilio.hang_up(call)
        except TwilioRestException as exc:
            log.warning("hang up of %s failed: %s", call.id, exc.msg)  # already over on Twilio's side
    await handoff_service.end_call(call)
    return call
