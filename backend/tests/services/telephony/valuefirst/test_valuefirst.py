"""Outbound calls through ValueFirst: the app dials, ValueFirst runs the campaign, its report closes the call."""

import json

import httpx
import pytest

from app.config.settings import get_settings
from app.services.telephony.valuefirst import calls as valuefirst


@pytest.fixture
def vf(monkeypatch):
    """ValueFirst configured, with a fake HTTP endpoint that records what was sent."""
    monkeypatch.setenv("CALL_PROVIDER", "valuefirst")
    monkeypatch.setenv("VALUEFIRST_API_TOKEN", "tok")
    monkeypatch.setenv("VALUEFIRST_CAMPAIGN_ID", "camp1")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.trycloudflare.com")
    get_settings.cache_clear()
    sent = []
    reply = {"status": 200, "body": {"requestid": "req-1"}}

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append({"auth": request.headers["Authorization"], "body": json.loads(request.content)})
        return httpx.Response(reply["status"], json=reply["body"])

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(valuefirst, "_client", lambda: client)
    return sent, reply


def test_dials_through_the_campaign(client, vf):
    sent, _ = vf
    res = client.post("/calls/outbound", json={"to": "+919911571741", "purpose": "order"})
    assert res.status_code == 200, res.text
    call = res.json()
    assert call["twilioCallSid"] == "vf:req-1" and call["status"] == "ai_active"

    req = sent[0]
    assert req["auth"] == "Bearer tok"
    msg = req["body"]["voice"]["messages"][0]
    assert msg["campaignid"] == "camp1" and msg["id"] == call["id"]
    assert msg["addresses"][0]["to"] == "9911571741"  # Indian numbers go as 10 digits
    assert req["body"]["voice"]["dlr"]["url"] == f"https://example.trycloudflare.com/valuefirst/dlr?call_id={call['id']}"


def test_error_from_valuefirst_is_shown_and_call_closed(client, vf):
    _, reply = vf
    reply.update(status=401, body={"error": "invalid token"})
    res = client.post("/calls/outbound", json={"to": "+919911571741"})
    assert res.status_code == 424 and "ValueFirst" in res.json()["detail"] and "invalid token" in res.json()["detail"]
    assert client.get("/calls").json()[0]["status"] == "ended"


def test_delivery_report_ends_the_call(client, vf):
    call = client.post("/calls/outbound", json={"to": "+919911571741"}).json()
    assert client.post(f"/valuefirst/dlr?call_id={call['id']}", json={"status": "NOANSWER"}).status_code == 204
    ended = client.get(f"/calls/{call['id']}").json()
    assert ended["status"] == "ended" and ended["transcript"][-1]["text"] == "Call not answered (noanswer)."


def test_hang_up_does_not_touch_twilio(client, vf, monkeypatch):
    from app.services.telephony.twilio import calls as twilio

    async def boom(call):
        raise AssertionError("Twilio must not be called for a ValueFirst call")

    monkeypatch.setattr(twilio, "hang_up", boom)
    call = client.post("/calls/outbound", json={"to": "+919911571741"}).json()
    assert client.post(f"/calls/{call['id']}/hangup").json()["status"] == "ended"


def test_numbers_outside_india_keep_their_country_code():
    assert valuefirst.local_number("+14155550100") == "14155550100"
