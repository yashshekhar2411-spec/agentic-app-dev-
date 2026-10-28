"""Redis-backed live state: AI conversations, the cross-server turn lock, and events shared between servers."""

import asyncio
import json

import fakeredis
import pytest

from app.services.realtime.bus import EventBus
from app.storage.conversations import RedisConversations, TurnBusy
from app.storage.store import ConversationState


@pytest.fixture
def server():
    return fakeredis.FakeServer()


def redis_on(server):
    return fakeredis.FakeAsyncRedis(server=server, decode_responses=True)


async def test_conversation_survives_between_servers(server):
    a, b = RedisConversations(redis_on(server), ttl_s=60), RedisConversations(redis_on(server), ttl_s=60)
    state = ConversationState(ai_turns=2, messages=[{"role": "user", "content": "hi"}])
    await a.save("call_1", state)

    loaded = await b.get("call_1")  # the next caller turn may land on another server
    assert loaded == state
    assert 0 < await a.redis.ttl("agentic:conversation:call_1") <= 60

    await b.drop("call_1")
    assert await a.get("call_1") == ConversationState()


async def test_one_turn_at_a_time_across_servers(server):
    a, b = RedisConversations(redis_on(server), ttl_s=60), RedisConversations(redis_on(server), ttl_s=60)
    async with a.turn("call_1", wait_s=0.5):
        with pytest.raises(TurnBusy):
            async with b.turn("call_1", wait_s=0.2):
                pass
        async with b.turn("call_2", wait_s=0.2):  # other calls aren't blocked
            pass
    async with b.turn("call_1", wait_s=0.2):  # free again once the first turn is done
        pass


class FakeSocket:
    def __init__(self) -> None:
        self.received: list[dict] = []

    async def send_text(self, text: str) -> None:
        self.received.append(json.loads(text))


async def test_events_reach_agents_on_every_server(server):
    bus_a, bus_b = EventBus(), EventBus()
    agent_a, agent_b = FakeSocket(), FakeSocket()
    bus_a._clients.add(agent_a)
    bus_b._clients.add(agent_b)
    await bus_a.start_relay(redis_on(server))
    await bus_b.start_relay(redis_on(server))
    try:
        await bus_a.publish("call.started", {"call": {"id": "call_1"}})
        for _ in range(50):
            if agent_a.received and agent_b.received:
                break
            await asyncio.sleep(0.02)
        assert agent_a.received == agent_b.received == [{"type": "call.started", "call": {"id": "call_1"}}]
    finally:
        await bus_a.stop_relay()
        await bus_b.stop_relay()
