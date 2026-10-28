import pytest

from app.config.settings import Settings
from app.features.handoff.policy import caller_wants_human, check_after_agent, check_before_agent
from app.features.handoff.models import HandoffReason
from app.storage.store import ConversationState

S = Settings(_env_file=None, max_failed_turns=3, max_ai_turns=5, max_tool_failures=2)


@pytest.mark.parametrize(
    "text",
    [
        "Can I speak to a human?",
        "I want to talk to a real person",
        "transfer me to a manager please",
        "representative",
        "Agent.",
        "mujhe kisi insaan se baat karni hai",
    ],
)
def test_detects_human_requests(text):
    assert caller_wants_human(text)


@pytest.mark.parametrize(
    "text",
    ["Where is my order?", "Are you an agent of Acme?", "I need to book an appointment"],
)
def test_ignores_normal_requests(text):
    assert not caller_wants_human(text)


def test_caller_asking_for_human_escalates():
    reason, _ = check_before_agent(ConversationState(), "let me talk to someone", S)
    assert reason == HandoffReason.CALLER_REQUESTED_HUMAN


def test_repeated_silence_escalates_on_third_try():
    state = ConversationState()
    assert check_before_agent(state, "", S) is None
    assert check_before_agent(state, "  ", S) is None
    reason, _ = check_before_agent(state, "", S)
    assert reason == HandoffReason.REPEATED_FAILURE


def test_speech_resets_silence_counter():
    state = ConversationState(failed_turns=2)
    assert check_before_agent(state, "hello", S) is None
    assert state.failed_turns == 0


def test_too_many_turns_escalates():
    reason, _ = check_before_agent(ConversationState(ai_turns=5), "hello again", S)
    assert reason == HandoffReason.TOO_MANY_TURNS


def test_tool_failures_escalate():
    assert check_after_agent(ConversationState(tool_failures=1), S) is None
    reason, _ = check_after_agent(ConversationState(tool_failures=2), S)
    assert reason == HandoffReason.TOOL_FAILURE
