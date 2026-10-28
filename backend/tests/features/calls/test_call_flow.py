"""End-to-end call flows through the HTTP API with a scripted AI."""

import asyncio

import anthropic
import httpx

from app.features.agent import orchestrator


def start_call(client):
    res = client.post("/simulate/calls", json={"fromNumber": "+919876543210"})
    assert res.status_code == 200
    return res.json()["call"]["id"]


def say(client, call_id, text):
    return client.post(f"/simulate/calls/{call_id}/say", json={"text": text})


def test_ai_handles_simple_request(client):
    call_id = start_call(client)
    body = say(client, call_id, "Where is my order?").json()
    assert body["reply"]["text"] == "Your order is out for delivery."
    assert body["reply"]["handoffReason"] is None
    assert body["call"]["status"] == "ai_active"
    speakers = [t["speaker"] for t in body["call"]["transcript"]]
    assert speakers == ["ai", "caller", "ai"]  # greeting, question, answer


def test_ai_ends_call_when_resolved(client):
    call_id = start_call(client)
    body = say(client, call_id, "That's all, bye").json()
    assert body["reply"]["endCall"] is True
    assert body["call"]["status"] == "ended"


def test_ai_decides_to_hand_off(client, fakes):
    call_id = start_call(client)
    body = say(client, call_id, "I want a refund for my watch").json()
    assert body["reply"]["handoffReason"] == "agent_decided"
    assert body["call"]["status"] == "awaiting_human"

    handoffs = client.get("/handoffs", params={"status": "pending"}).json()
    assert len(handoffs) == 1
    assert handoffs[0]["callId"] == call_id
    assert handoffs[0]["detail"] == "Caller wants a refund"

    # AI no longer answers once a human is needed
    assert say(client, call_id, "hello?").status_code == 409


def test_caller_request_skips_the_ai(client, fakes):
    call_id = start_call(client)
    body = say(client, call_id, "Let me speak to a real person").json()
    assert body["reply"]["handoffReason"] == "caller_requested_human"
    assert fakes.calls == []  # policy escalated before the model was called


def test_ai_error_hands_off(client):
    class BrokenBrain:
        async def respond(self, state, caller_text):
            request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
            raise anthropic.APIConnectionError(request=request)

    orchestrator.set_brain(BrokenBrain())
    call_id = start_call(client)
    body = say(client, call_id, "Where is my order?").json()
    assert body["reply"]["handoffReason"] == "agent_error"


def test_ai_timeout_hands_off(client, monkeypatch):
    class SlowBrain:
        async def respond(self, state, caller_text):
            await asyncio.sleep(5)

    monkeypatch.setenv("AGENT_TURN_TIMEOUT_S", "0.05")
    from app.config.settings import get_settings

    get_settings.cache_clear()
    orchestrator.set_brain(SlowBrain())
    call_id = start_call(client)
    body = say(client, call_id, "Where is my order?").json()
    assert body["reply"]["handoffReason"] == "agent_error"


def test_human_accepts_handoff(client):
    human = client.post("/humans/register", json={"name": "Asha", "phone": "+911111111111"}).json()
    client.patch(f"/humans/{human['id']}/status", json={"status": "online"})

    call_id = start_call(client)
    say(client, call_id, "I need a refund")
    handoff = client.get("/handoffs").json()[0]

    res = client.post(f"/handoffs/{handoff['id']}/accept", json={"humanId": human["id"]})
    assert res.status_code == 200
    assert res.json()["status"] == "accepted"
    assert client.get(f"/calls/{call_id}").json()["status"] == "human_active"
    assert client.get("/humans").json()[0]["status"] == "busy"

    # second human can't grab the same call
    other = client.post("/humans/register", json={"name": "Ben", "phone": "+912222222222"}).json()
    assert client.post(f"/handoffs/{handoff['id']}/accept", json={"humanId": other["id"]}).status_code == 409

    # hang up frees the human
    client.post(f"/simulate/calls/{call_id}/hangup")
    assert client.get("/humans").json()[0]["status"] == "online"


def test_hangup_while_waiting_expires_handoff(client):
    call_id = start_call(client)
    say(client, call_id, "I need a refund")
    client.post(f"/simulate/calls/{call_id}/hangup")
    assert client.get("/handoffs").json()[0]["status"] == "expired"


def test_websocket_streams_events(client):
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "snapshot"
        call_id = start_call(client)
        started = ws.receive_json()
        assert started["type"] == "call.started" and started["call"]["id"] == call_id
        assert ws.receive_json()["type"] == "call.transcript"  # greeting
