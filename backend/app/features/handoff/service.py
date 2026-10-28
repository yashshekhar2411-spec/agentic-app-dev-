"""AI -> human handoff lifecycle: create, brief, notify, accept, expire."""

import asyncio
import logging

from app.features.agent.summarizer import Summarizer
from app.config.settings import get_settings
from app.services.realtime.bus import bus
from app.features.agent.models import AgentReply
from app.features.calls.models import Call, CallStatus, Speaker, Turn
from app.features.handoff.models import Handoff, HandoffStatus
from app.features.profile.models import Human, HumanStatus
from app.utils.api_model import now
from app.storage.conversations import conversations
from app.storage.store import store
from app.services.telephony.twilio import calls as twilio
from app.services import notifications as notifier

log = logging.getLogger(__name__)

_summarizer: Summarizer | None = None
_background: set[asyncio.Task] = set()


class HandoffError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _get_summarizer() -> Summarizer:
    global _summarizer
    if _summarizer is None:
        _summarizer = Summarizer()
    return _summarizer


async def drain_background(timeout: float) -> None:
    """On shutdown, give pending briefs/notifications a moment to finish, then cancel the rest."""
    if not _background:
        return
    _, pending = await asyncio.wait(set(_background), timeout=timeout)
    for task in pending:
        task.cancel()


def transcript_text(call: Call) -> str:
    return "\n".join(f"{t.speaker.value}: {t.text}" for t in call.transcript)


def fallback_summary(call: Call, handoff: Handoff) -> str:
    said = [t.text for t in call.transcript if t.speaker == Speaker.CALLER][-3:]
    return f"Caller {call.from_number}. Last said: {' / '.join(said) or 'nothing'}. Reason: {handoff.detail or handoff.reason.value}."


async def start_handoff(call: Call, reply: AgentReply) -> Handoff:
    assert reply.handoff_reason is not None
    handoff = Handoff(call_id=call.id, reason=reply.handoff_reason, detail=reply.handoff_detail, urgency=reply.urgency)
    await store.add_handoff(handoff)
    call.status = CallStatus.AWAITING_HUMAN
    call.handoff_id = handoff.id
    await store.update_call(call, "status", "handoff_id")
    turn = Turn(speaker=Speaker.SYSTEM, text=f"Handed to a human: {handoff.reason.value}")
    call.transcript.append(turn)
    await store.add_turn(call.id, turn)

    # Tell humans immediately; the AI brief follows a moment later
    await bus.publish("call.updated", {"call": call.to_wire()})
    await bus.publish("handoff.requested", {"handoff": handoff.to_wire()})

    task = asyncio.create_task(_brief_and_notify(call, handoff))
    _background.add(task)
    task.add_done_callback(_background.discard)
    return handoff


async def _brief_and_notify(call: Call, handoff: Handoff) -> None:
    try:
        if not get_settings().anthropic_api_key and _summarizer is None:
            raise RuntimeError("no Claude key: using fallback summary")
        handoff.summary = await _get_summarizer().summarize(transcript_text(call), handoff.detail or handoff.reason.value)
    except Exception:
        log.info("AI summary unavailable for %s, using fallback", handoff.id)
    if not handoff.summary:
        handoff.summary = fallback_summary(call, handoff)
    await store.update_handoff(handoff, "summary")
    # Re-read: a human may have taken the call while the brief was being written
    current = await store.get_handoff(handoff.id) or handoff
    await bus.publish("handoff.updated", {"handoff": current.to_wire()})
    if current.status == HandoffStatus.PENDING:
        await notifier.notify_humans(await store.online_humans(), current, call)


async def accept_handoff(handoff_id: str, human_id: str) -> Handoff:
    handoff = await store.get_handoff(handoff_id)
    human: Human | None = await store.get_human(human_id)
    if handoff is None:
        raise HandoffError("Handoff not found", 404)
    if human is None:
        raise HandoffError("Human not found", 404)
    if handoff.status != HandoffStatus.PENDING:
        raise HandoffError(f"Handoff is already {handoff.status.value}", 409)
    call = await store.get_call(handoff.call_id)
    if call is None:
        raise HandoffError("Call not found", 404)

    # Atomic claim, so two humans (even on different servers) can't both win
    accepted_at = now()
    if not await store.claim_handoff(handoff.id, human.id, accepted_at):
        current = await store.get_handoff(handoff.id)
        raise HandoffError(f"Handoff is already {current.status.value if current else 'gone'}", 409)
    handoff.status, handoff.assigned_to, handoff.accepted_at = HandoffStatus.ACCEPTED, human.id, accepted_at
    human.status = HumanStatus.BUSY
    call.status = CallStatus.HUMAN_ACTIVE
    await store.update_human(human, "status")
    await store.update_call(call, "status")

    # Only a real Twilio call (its SID starts with CA) can be bridged to this human from here. Calls run by
    # ElevenLabs hand over inside ElevenLabs (the agent's transfer_to_number tool).
    if call.twilio_call_sid and call.twilio_call_sid.startswith("CA"):
        try:
            await twilio.connect_human(call, human, handoff.summary or fallback_summary(call, handoff))
        except Exception as exc:
            log.exception("bridge failed for %s", handoff.id)
            handoff.status, handoff.assigned_to, handoff.accepted_at = HandoffStatus.PENDING, None, None
            human.status = HumanStatus.ONLINE
            call.status = CallStatus.AWAITING_HUMAN
            await store.update_handoff(handoff, "status", "assigned_to", "accepted_at")
            await store.update_human(human, "status")
            await store.update_call(call, "status")
            raise HandoffError(f"Could not ring your phone: {exc}", 502) from exc

    turn = Turn(speaker=Speaker.SYSTEM, text=f"{human.name} took over the call")
    call.transcript.append(turn)
    await store.add_turn(call.id, turn)
    await bus.publish("handoff.accepted", {"handoff": handoff.to_wire()})
    await bus.publish("call.updated", {"call": call.to_wire()})
    return handoff


async def end_call(call: Call, status: CallStatus = CallStatus.ENDED) -> None:
    if call.status in (CallStatus.ENDED, CallStatus.VOICEMAIL) and status == CallStatus.ENDED:
        return
    call.status = status
    call.ended_at = call.ended_at or now()
    await store.update_call(call, "status", "ended_at", "voicemail_url")
    if call.handoff_id and (handoff := await store.get_handoff(call.handoff_id)):
        if handoff.status == HandoffStatus.PENDING and await store.expire_handoff(handoff.id):
            handoff.status = HandoffStatus.EXPIRED
            await bus.publish("handoff.updated", {"handoff": handoff.to_wire()})
        elif handoff.assigned_to and (human := await store.get_human(handoff.assigned_to)):
            if human.status == HumanStatus.BUSY:
                human.status = HumanStatus.ONLINE
                await store.update_human(human, "status")
    await bus.publish("call.updated", {"call": call.to_wire()})
    await conversations.drop(call.id)
    await store.call_finished(call)
