"""Hard rules for when the AI must stop and hand the call to a human.

These run around every AI turn. The model can also decide on its own by calling request_handoff;
these rules are the safety net that doesn't depend on the model's judgement.
"""

import re

from app.config.settings import Settings
from app.features.handoff.models import HandoffReason
from app.storage.store import ConversationState

_ASK_VERBS = r"(speak|talk|connect|transfer|put me through|give me|get me|want|need)"
_PERSON = r"(human|person|agent|representative|rep|someone|somebody|operator|manager|supervisor|executive)"

_HUMAN_REQUEST = [
    re.compile(rf"\b{_ASK_VERBS}\b.*\b{_PERSON}\b", re.I),
    re.compile(r"\b(real person|human being|live agent|customer care executive|not a (bot|robot|machine))\b", re.I),
    re.compile(rf"^\W*{_PERSON}\W*$", re.I),  # caller just says "agent" / "representative"
    # Hindi / Hinglish
    re.compile(r"(insaan|aadmi|kisi se baat|kisi insaan|asli vyakti|executive se baat)", re.I),
]


def caller_wants_human(text: str) -> bool:
    return any(p.search(text) for p in _HUMAN_REQUEST)


def check_before_agent(state: ConversationState, caller_text: str, s: Settings) -> tuple[HandoffReason, str] | None:
    """Run on each caller turn before the AI answers."""
    if not caller_text.strip():
        state.failed_turns += 1
        if state.failed_turns >= s.max_failed_turns:
            return HandoffReason.REPEATED_FAILURE, f"Could not hear or understand the caller {state.failed_turns} times"
        return None

    state.failed_turns = 0
    if caller_wants_human(caller_text):
        return HandoffReason.CALLER_REQUESTED_HUMAN, f'Caller said: "{caller_text}"'
    if state.ai_turns >= s.max_ai_turns:
        return HandoffReason.TOO_MANY_TURNS, f"Not resolved after {state.ai_turns} AI turns"
    return None


def check_after_agent(state: ConversationState, s: Settings) -> tuple[HandoffReason, str] | None:
    """Run after the AI has answered."""
    if state.tool_failures >= s.max_tool_failures:
        return HandoffReason.TOOL_FAILURE, f"{state.tool_failures} tool calls failed"
    return None
