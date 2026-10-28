"""AI calls through ElevenLabs: the app asks, ElevenLabs calls and talks, and its conversations are mirrored back
(live through the poller, finished through the signed webhook)."""

import hashlib
import hmac
import json
import time

import httpx
import pytest

from app.config.settings import get_settings
from app.services.telephony.elevenlabs import client as el, sync

CUSTOMER = "+919911571741"
SECRET = "whsec_test"


@pytest.fixture
def eleven(monkeypatch):
    """ElevenLabs configured, with a fake API that records requests and serves whatever `state` holds."""
    for k, v in {
        "ELEVEN_LABS_API_KEY": "sk_test", "ELEVEN_LABS_AGENT_ID": "agent_1", "ELEVEN_LABS_CALLER_ID": "+14155550100",
        "ELEVEN_LABS_WEBHOOKS_SECRET": SECRET, "CALL_PROVIDER": "elevenlabs",
    }.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    monkeypatch.setattr(el, "_number", None)
    state = {
        "numbers": [{"phone_number_id": "phnum_1", "phone_number": "+14155550100", "provider": "twilio"}],
        "call": {"success": True, "message": "ok", "conversation_id": "conv_1"},
        "error": None,  # (status, body) to fail every request with
        "list": [],
        "detail": {},
        "sent": [],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        state["sent"].append({"method": request.method, "path": request.url.path, "key": request.headers.get("xi-api-key"), "body": body, "query": dict(request.url.params)})
        if state["error"]:
            return httpx.Response(state["error"][0], json=state["error"][1])
        path = request.url.path
        if path == "/v1/convai/phone-numbers":
            return httpx.Response(200, json=state["numbers"])
        if path.endswith("/outbound-call"):
            return httpx.Response(200, json=state["call"])
        if path == "/v1/convai/conversations":
            return httpx.Response(200, json={"conversations": state["list"], "has_more": False})
        if path.startswith("/v1/convai/conversations/"):
            return httpx.Response(200, json=state["detail"][path.rsplit("/", 1)[1]])
        return httpx.Response(404, json={"detail": "unknown"})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(el, "_client", lambda: http)
    return state


def convo(cid="conv_1", status="in-progress", turns=(), direction="inbound", number=CUSTOMER, summary=None, tools=()):
    transcript = [{"role": r, "message": m, "time_in_call_secs": i, "tool_calls": []} for i, (r, m) in enumerate(turns)]
    if tools:
        transcript.append({"role": "agent", "message": None, "time_in_call_secs": 99, "tool_calls": [{"tool_name": t} for t in tools]})
    return {
        "conversation_id": cid, "agent_id": "agent_1", "status": status, "transcript": transcript,
        "metadata": {"phone_call": {"direction": direction, "external_number": number, "agent_number": "+14155550100", "type": "twilio"}},
        "analysis": {"transcript_summary": summary} if summary else {},
    }


def signed(payload: dict, secret=SECRET, at=None):
    body = json.dumps(payload).encode()
    t = int(at or time.time())
    v0 = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return {"content": body, "headers": {"ElevenLabs-Signature": f"t={t},v0={v0}", "Content-Type": "application/json"}}


def run(client, coro_fn, *args):
    return client.portal.call(coro_fn, *args)


def calls(client):
    return client.get("/calls").json()


# ---- placing calls ----

def test_places_the_call_from_the_agents_number(client, eleven):
    res = client.post("/calls/outbound", json={"to": CUSTOMER, "purpose": "your order"})
    assert res.status_code == 200, res.text
    assert res.json()["twilioCallSid"] == "el:conv_1" and res.json()["status"] == "ai_active"
    call = next(r for r in eleven["sent"] if r["path"].endswith("/twilio/outbound-call"))
    assert call["key"] == "sk_test"
    assert call["body"]["agent_id"] == "agent_1" and call["body"]["agent_phone_number_id"] == "phnum_1"
    assert call["body"]["to_number"] == CUSTOMER
    assert call["body"]["conversation_initiation_client_data"]["dynamic_variables"]["purpose"] == "your order"


def test_caller_id_can_be_the_phone_number_id(client, eleven, monkeypatch):
    monkeypatch.setenv("ELEVEN_LABS_CALLER_ID", "phnum_1")
    get_settings.cache_clear()
    assert client.post("/calls/outbound", json={"to": CUSTOMER}).status_code == 200


def test_sip_trunk_numbers_use_the_sip_endpoint(client, eleven):
    eleven["numbers"][0]["provider"] = "sip_trunk"
    assert client.post("/calls/outbound", json={"to": CUSTOMER}).status_code == 200
    assert any(r["path"] == "/v1/convai/sip-trunk/outbound-call" for r in eleven["sent"])


def test_a_number_not_set_up_in_elevenlabs_is_explained(client, eleven):
    eleven["numbers"] = []
    res = client.post("/calls/outbound", json={"to": CUSTOMER})
    assert res.status_code == 424 and "import your Twilio or SIP trunk number" in res.json()["detail"]
    assert calls(client)[0]["status"] == "ended"


def test_elevenlabs_errors_are_shown(client, eleven):
    eleven["error"] = (401, {"detail": {"status": "invalid_api_key", "message": "API key ID used as API key"}})
    res = client.post("/calls/outbound", json={"to": CUSTOMER})
    assert res.status_code == 424 and "API key ID used as API key" in res.json()["detail"] and "ElevenLabs" in res.json()["detail"]
    assert "Couldn't place the call" in calls(client)[0]["transcript"][-1]["text"]


def test_not_configured(client, eleven, monkeypatch):
    monkeypatch.setenv("ELEVEN_LABS_API_KEY", "")
    get_settings.cache_clear()
    res = client.post("/calls/outbound", json={"to": CUSTOMER})
    assert res.status_code == 503 and "ELEVEN_LABS" in res.json()["detail"]


def test_an_elevenlabs_call_cannot_be_hung_up_from_here(client, eleven):
    call = client.post("/calls/outbound", json={"to": CUSTOMER}).json()
    res = client.post(f"/calls/{call['id']}/hangup")
    assert res.status_code == 409 and "ElevenLabs" in res.json()["detail"]


# ---- mirroring conversations ----

def test_live_conversation_shows_up_and_grows(client, eleven):
    eleven["list"] = [{"conversation_id": "conv_9", "status": "in-progress"}]
    eleven["detail"]["conv_9"] = convo("conv_9", turns=[("agent", "Hello, how can I help?")])
    run(client, sync.poll_once)
    [call] = calls(client)
    assert call["direction"] == "inbound" and call["fromNumber"] == CUSTOMER and call["status"] == "ai_active"
    assert [t["text"] for t in call["transcript"]] == ["Hello, how can I help?"]

    eleven["detail"]["conv_9"] = convo("conv_9", turns=[("agent", "Hello, how can I help?"), ("user", "Where is my order?"), ("agent", "It's out for delivery.")])
    run(client, sync.poll_once)
    [call] = calls(client)
    assert [(t["speaker"], t["text"]) for t in call["transcript"]] == [
        ("ai", "Hello, how can I help?"), ("caller", "Where is my order?"), ("ai", "It's out for delivery."),
    ]


def test_finished_conversation_is_closed_with_its_summary(client, eleven):
    eleven["list"] = [{"conversation_id": "conv_9", "status": "in-progress"}]
    eleven["detail"]["conv_9"] = convo("conv_9", turns=[("agent", "Hi"), ("user", "Bye")])
    run(client, sync.poll_once)
    eleven["list"] = [{"conversation_id": "conv_9", "status": "done"}]
    eleven["detail"]["conv_9"] = convo("conv_9", "done", [("agent", "Hi"), ("user", "Bye")], summary="Caller said goodbye.")
    run(client, sync.poll_once)
    [call] = calls(client)
    assert call["status"] == "ended" and call["endedAt"]
    assert call["transcript"][-1]["text"] == "Summary: Caller said goodbye."
    run(client, sync.poll_once)  # nothing new: no duplicates
    assert len(calls(client)[0]["transcript"]) == 3


def test_the_agents_transfer_marks_the_call_with_a_person(client, eleven):
    eleven["list"] = [{"conversation_id": "conv_9", "status": "in-progress"}]
    eleven["detail"]["conv_9"] = convo("conv_9", turns=[("agent", "Hi"), ("user", "I want a refund")], tools=["transfer_to_number"])
    run(client, sync.poll_once)
    [call] = calls(client)
    assert call["status"] == "human_active"
    assert call["transcript"][-1]["text"] == "The AI transferred the call to a person."


def test_a_call_we_placed_is_matched_to_its_conversation(client, eleven):
    eleven["call"] = {"success": True, "message": "ok"}  # no conversation id yet
    placed = client.post("/calls/outbound", json={"to": CUSTOMER, "purpose": "order"}).json()
    assert placed["twilioCallSid"] == f"el-pending:{placed['id']}"
    eleven["list"] = [{"conversation_id": "conv_5", "status": "in-progress"}]
    eleven["detail"]["conv_5"] = convo("conv_5", turns=[("agent", "Hello!")], direction="outbound")
    run(client, sync.poll_once)
    [call] = calls(client)  # the same call, not a second one
    assert call["id"] == placed["id"] and call["twilioCallSid"] == "el:conv_5" and call["purpose"] == "order"
    assert call["transcript"][0]["text"] == "Hello!"


def test_a_call_elevenlabs_never_reports_is_given_up_on(client, eleven, monkeypatch):
    eleven["call"] = {"success": True, "message": "ok"}
    client.post("/calls/outbound", json={"to": CUSTOMER})
    monkeypatch.setattr(sync, "PENDING_GIVE_UP_S", -1)
    run(client, sync.poll_once)
    call = calls(client)[0]
    assert call["status"] == "ended" and call["transcript"][-1]["text"] == "ElevenLabs never reported this call."


def test_finished_calls_from_while_the_server_was_off_are_copied_in(client, eleven):
    eleven["list"] = [{"conversation_id": "conv_old", "status": "done"}]
    eleven["detail"]["conv_old"] = convo("conv_old", "done", [("agent", "Hi"), ("user", "Hello")], summary="A short chat.")
    run(client, sync.poll_once)
    [call] = calls(client)
    assert call["status"] == "ended" and call["transcript"][0]["text"] == "Hi"


# ---- the signed webhook ----

def test_post_call_webhook_records_the_finished_call(client, eleven):
    event = {"type": "post_call_transcription", "data": convo("conv_7", "done", [("agent", "Hi"), ("user", "Thanks")], summary="Quick thanks.")}
    assert client.post("/elevenlabs/webhook", **signed(event)).status_code == 200
    [call] = calls(client)
    assert call["status"] == "ended" and call["transcript"][-1]["text"] == "Summary: Quick thanks."
    assert client.post("/elevenlabs/webhook", **signed(event)).status_code == 200  # a retry changes nothing
    assert len(calls(client)) == 1 and len(calls(client)[0]["transcript"]) == 3


def test_webhook_refuses_bad_signatures(client, eleven):
    event = {"type": "post_call_transcription", "data": convo("conv_7", "done")}
    good = signed(event)
    assert client.post("/elevenlabs/webhook", content=good["content"]).status_code == 401  # unsigned
    assert client.post("/elevenlabs/webhook", **signed(event, secret="someone-else")).status_code == 401  # wrong secret
    assert client.post("/elevenlabs/webhook", **signed(event, at=time.time() - 3600)).status_code == 401  # too old
    tampered = {**good, "content": good["content"].replace(b"conv_7", b"conv_8")}
    assert client.post("/elevenlabs/webhook", **tampered).status_code == 401  # body changed after signing
    assert calls(client) == []


def test_webhook_needs_a_secret(client, eleven, monkeypatch):
    monkeypatch.setenv("ELEVEN_LABS_WEBHOOKS_SECRET", "")
    get_settings.cache_clear()
    assert client.post("/elevenlabs/webhook", **signed({"type": "post_call_audio", "data": {}})).status_code == 503


def test_calls_that_never_connected_are_closed(client, eleven):
    eleven["call"] = {"success": True, "message": "ok", "conversation_id": "conv_3"}
    placed = client.post("/calls/outbound", json={"to": CUSTOMER}).json()
    event = {"type": "call_initiation_failure", "data": {"agent_id": "agent_1", "conversation_id": "conv_3", "failure_reason": "no-answer"}}
    assert client.post("/elevenlabs/webhook", **signed(event)).status_code == 200
    call = client.get(f"/calls/{placed['id']}").json()
    assert call["status"] == "ended" and call["transcript"][-1]["text"] == "Nobody answered."


def test_audio_events_are_acknowledged_and_ignored(client, eleven):
    event = {"type": "post_call_audio", "data": {"conversation_id": "conv_7", "full_audio": "AAAA"}}
    assert client.post("/elevenlabs/webhook", **signed(event)).status_code == 200
    assert calls(client) == []


def test_the_poller_starts_with_the_app(monkeypatch):
    """Without this running, live calls would only show up when the webhook arrives after they end."""
    from app.main import app
    from tests.conftest import running

    seen = []

    async def fake_poll_once():
        seen.append(1)

    for k, v in {"ELEVEN_LABS_API_KEY": "sk", "ELEVEN_LABS_AGENT_ID": "agent_1", "ELEVEN_LABS_CALLER_ID": "+14155550100"}.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    monkeypatch.setattr(sync, "poll_once", fake_poll_once)
    with running(app) as c:
        deadline = time.time() + 3
        while not seen and time.time() < deadline:
            time.sleep(0.05)
    assert seen, "poll_forever never ran"
