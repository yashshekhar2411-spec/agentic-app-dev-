"""One caller turn: policy check -> AI -> policy check -> what to say next.

Used by both the Twilio webhooks and the simulator, so behaviour is identical in testing and production.
"""

import asyncio
import logging

import anthropic

from app.config.settings import Settings, get_settings
from app.services.realtime.bus import bus
from app.features.handoff import policy
from app.features.agent.models import AgentReply
from app.features.calls.models import Call, CallDirection, Speaker, Turn
from app.features.handoff.models import HandoffReason
from app.storage.conversations import TurnBusy, conversations
from app.storage.store import ConversationState, store
from app.features.agent.brains import TRANSFER_LINE, Brain, ClaudeBrain, DemoBrain

log = logging.getLogger(__name__)

_brain: Brain | None = None


def get_brain() -> Brain:
    global _brain
    if _brain is None:
        if get_settings().anthropic_api_key:
            _brain = ClaudeBrain()
        else:
            log.warning("ANTHROPIC_API_KEY is not set: running the keyword DEMO agent, not Claude")
            _brain = DemoBrain()
    return _brain


def set_brain(brain: Brain | None) -> None:
    """Swap the AI implementation (used by tests)."""
    global _brain
    _brain = brain


SILENCE_PROMPT = "Sorry, I didn't catch that. Could you say it again?"


def call_details(call: Call) -> str:
    if call.direction == CallDirection.OUTBOUND:
        opener = next((t.text for t in call.transcript if t.speaker == Speaker.AI), "")
        purpose = call.purpose or "a general check-in"
        return f'[Call details: outbound call you placed to {call.from_number}. Reason for the call: {purpose}. You opened with: "{opener}"]'
    return f"[Call details: caller number {call.from_number}]"


async def add_turn(call: Call, speaker: Speaker, text: str) -> None:
    turn = Turn(speaker=speaker, text=text)
    call.transcript.append(turn)
    await store.add_turn(call.id, turn)
    await bus.publish("call.transcript", {"callId": call.id, "turn": turn.to_wire()})


async def handle_caller_turn(call: Call, caller_text: str) -> AgentReply:
    s = get_settings()
    # One turn per call at a time, across all servers: overlapping turns (e.g. a Twilio retry) would
    # interleave the AI's message history
    try:
        async with conversations.turn(call.id, wait_s=s.agent_turn_timeout_s):
            state = await conversations.get(call.id)
            try:
                return await _caller_turn(call, caller_text, state, s)
            finally:
                await conversations.save(call.id, state)
    except TurnBusy:
        log.warning("previous turn for %s still running", call.id)
        return AgentReply(text=SILENCE_PROMPT)


async def _caller_turn(call: Call, caller_text: str, state: ConversationState, s: Settings) -> AgentReply:
    caller_text = caller_text.strip()

    if caller_text:
        await add_turn(call, Speaker.CALLER, caller_text)

    reply: AgentReply
    if decision := policy.check_before_agent(state, caller_text, s):
        reason, detail = decision
        reply = AgentReply(text=TRANSFER_LINE, handoff_reason=reason, handoff_detail=detail)
    elif not caller_text:
        reply = AgentReply(text=SILENCE_PROMPT)
    else:
        state.ai_turns += 1
        # First turn carries call details so the system prompt stays identical (cacheable) for every call
        text_for_ai = caller_text if state.messages else f"{call_details(call)}\n{caller_text}"
        try:
            reply = await asyncio.wait_for(get_brain().respond(state, text_for_ai), timeout=s.agent_turn_timeout_s)
        except asyncio.TimeoutError:
            log.warning("AI turn timed out for %s", call.id)
            reply = AgentReply(text=TRANSFER_LINE, handoff_reason=HandoffReason.AGENT_ERROR, handoff_detail="AI took too long to respond")
        except anthropic.APIError as exc:
            log.error("Claude API error for %s: %s", call.id, exc)
            reply = AgentReply(text=TRANSFER_LINE, handoff_reason=HandoffReason.AGENT_ERROR, handoff_detail=f"AI unavailable: {type(exc).__name__}")
        except Exception as exc:  # never drop a caller because of a bug in the AI path
            log.exception("AI turn failed for %s", call.id)
            reply = AgentReply(text=TRANSFER_LINE, handoff_reason=HandoffReason.AGENT_ERROR, handoff_detail=f"AI failed: {type(exc).__name__}")

        if reply.handoff_reason is None and not reply.end_call:
            if decision := policy.check_after_agent(state, s):
                reason, detail = decision
                reply = AgentReply(text=f"{reply.text} {TRANSFER_LINE}".strip(), handoff_reason=reason, handoff_detail=detail)

    await add_turn(call, Speaker.AI, reply.text)
    return reply
