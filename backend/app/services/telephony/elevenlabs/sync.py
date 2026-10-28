"""Mirrors ElevenLabs conversations into the app: the live transcript, incoming and outgoing calls, transfers to a
person, and how each call ended.

ElevenLabs runs the conversation. Two things feed this module: a poller that copies live conversations every few
seconds (so the Live tab and a call's transcript move as people talk), and the post-call webhook that delivers the
final transcript and summary (see webhooks.py). Both end up in sync_conversation, which is safe to run repeatedly.
"""

import asyncio
import logging
import re
import time

from app.config.settings import get_settings
from app.features.agent.orchestrator import add_turn
from app.features.calls.models import Call, CallDirection, CallStatus, Speaker
from app.features.handoff import service as handoff_service
from app.services.realtime.bus import bus
from app.services.telephony.elevenlabs import client
from app.storage.store import StoreConflict, store

log = logging.getLogger(__name__)

SID = "el:"  # twilio_call_sid of a call that has an ElevenLabs conversation: el:<conversation_id>
PENDING = "el-pending:"  # a call we placed whose conversation id ElevenLabs hasn't reported yet: el-pending:<call id>
ACTIVE = {"initiated", "in-progress", "processing"}
FINAL = {"done", "failed"}
PENDING_GIVE_UP_S = 120  # an outgoing call ElevenLabs never reported
BACKFILL_PER_POLL = 5  # finished conversations we haven't seen are copied in a few at a time
WINDOW_S = 6 * 3600  # how far back the poller looks

_NOT_CONNECTED = {"busy": "Line was busy.", "no-answer": "Nobody answered."}


def is_elevenlabs(call: Call) -> bool:
    return bool(call.twilio_call_sid and call.twilio_call_sid.startswith((SID, PENDING)))


def e164(number: str) -> str:
    digits = re.sub(r"\D", "", number or "")
    if not digits:
        return "unknown"
    return "+" + digits


async def _adopt_pending(number: str) -> Call | None:
    """The outgoing call we placed to `number`, still waiting for its conversation id."""
    for call in await store.list_calls(limit=50):
        if call.ended_at is None and call.twilio_call_sid and call.twilio_call_sid.startswith(PENDING) and call.from_number == number:
            return call
    return None


async def sync_conversation(detail: dict) -> Call | None:
    """Brings the app's copy of one conversation up to date with ElevenLabs's. Returns the call."""
    cid = detail.get("conversation_id")
    if not cid:
        return None
    sid = SID + cid
    call = await store.call_by_sid(sid)
    if call is None:
        phone = (detail.get("metadata") or {}).get("phone_call") or {}
        number = e164(phone.get("external_number", ""))
        outbound = phone.get("direction") == "outbound"
        call = await _adopt_pending(number) if outbound else None
        if call is not None:
            call.twilio_call_sid = sid
            await store.update_call(call, "twilio_call_sid")
        else:
            try:
                call = await store.add_call(
                    Call(from_number=number, direction=CallDirection.OUTBOUND if outbound else CallDirection.INBOUND, twilio_call_sid=sid)
                )
            except StoreConflict:  # the poller and the webhook arrived together
                call = await store.call_by_sid(sid)
                if call is None:
                    return None
            else:
                await bus.publish("call.started", {"call": call.to_wire()})

    turns = detail.get("transcript") or []
    spoken = [t for t in turns if (t.get("message") or "").strip()]
    have = sum(1 for t in call.transcript if t.speaker != Speaker.SYSTEM)  # turns already copied
    for turn in spoken[have:]:
        await add_turn(call, Speaker.AI if turn.get("role") == "agent" else Speaker.CALLER, turn["message"].strip())

    # The agent's transfer_to_number tool hands the live call to a person
    transferred = any(tc.get("tool_name") == "transfer_to_number" for t in turns for tc in (t.get("tool_calls") or []))
    if transferred and call.status == CallStatus.AI_ACTIVE:
        call.status = CallStatus.HUMAN_ACTIVE
        await store.update_call(call, "status")
        await add_turn(call, Speaker.SYSTEM, "The AI transferred the call to a person.")
        await bus.publish("call.updated", {"call": call.to_wire()})

    if detail.get("status") in FINAL and call.ended_at is None:
        summary = ((detail.get("analysis") or {}).get("transcript_summary") or "").strip()
        if detail.get("status") == "failed":
            await add_turn(call, Speaker.SYSTEM, "The call failed.")
        elif not spoken:
            await add_turn(call, Speaker.SYSTEM, "The call ended before anyone spoke.")
        if summary:
            await add_turn(call, Speaker.SYSTEM, f"Summary: {summary}")
        await handoff_service.end_call(call)
    return call


async def fail_initiation(data: dict) -> None:
    """ElevenLabs couldn't connect an outgoing call (call_initiation_failure webhook)."""
    reason = _NOT_CONNECTED.get(str(data.get("failure_reason")), "The call couldn't be connected.")
    call = await store.call_by_sid(SID + data["conversation_id"]) if data.get("conversation_id") else None
    if call is None:
        waiting = [c for c in await store.list_calls(limit=50) if c.ended_at is None and (c.twilio_call_sid or "").startswith(PENDING)]
        call = waiting[0] if len(waiting) == 1 else None  # only safe to guess when there's one candidate
    if call is not None and call.ended_at is None:
        await add_turn(call, Speaker.SYSTEM, reason)
        await handoff_service.end_call(call)


async def poll_once() -> None:
    """One pass: copy live conversations, finish the ones that ended, and give up on calls ElevenLabs never reported."""
    now = time.time()
    backfilled = 0
    for item in await client.list_conversations(int(now - WINDOW_S)):
        cid, status = item.get("conversation_id"), item.get("status")
        if not cid:
            continue
        known = await store.call_by_sid(SID + cid)
        if status in ACTIVE or (known is not None and known.ended_at is None and status in FINAL):
            await sync_conversation(await client.get_conversation(cid))
        elif known is None and status in FINAL and backfilled < BACKFILL_PER_POLL:
            backfilled += 1  # finished while the server was off: copy it in so History is complete
            await sync_conversation(await client.get_conversation(cid))
    for call in await store.list_calls(limit=50):
        if call.ended_at is None and (call.twilio_call_sid or "").startswith(PENDING):
            if (time.time() - call.started_at.timestamp()) > PENDING_GIVE_UP_S:
                await add_turn(call, Speaker.SYSTEM, "ElevenLabs never reported this call.")
                await handoff_service.end_call(call)


async def poll_forever() -> None:
    last_error = ""
    while True:
        s = get_settings()
        if client.configured():
            try:
                await poll_once()
                last_error = ""
            except client.ElevenLabsError as exc:
                if str(exc) != last_error:  # say it once, not every few seconds
                    log.warning("ElevenLabs sync: %s", exc)
                    last_error = str(exc)
            except Exception:
                log.exception("ElevenLabs sync failed")
        await asyncio.sleep(s.eleven_labs_poll_s)
