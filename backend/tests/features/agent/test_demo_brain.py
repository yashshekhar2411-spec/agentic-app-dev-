from app.features.agent.brains import DemoBrain
from app.features.handoff.models import HandoffReason
from app.storage.store import ConversationState


async def test_demo_answers_order_status():
    reply = await DemoBrain().respond(ConversationState(), "where is ORD-1001")
    assert "out for delivery" in reply.text and reply.handoff_reason is None


async def test_demo_hands_off_refunds():
    reply = await DemoBrain().respond(ConversationState(), "I want a refund")
    assert reply.handoff_reason == HandoffReason.AGENT_DECIDED


async def test_demo_ends_call():
    assert (await DemoBrain().respond(ConversationState(), "no thanks, bye")).end_call
