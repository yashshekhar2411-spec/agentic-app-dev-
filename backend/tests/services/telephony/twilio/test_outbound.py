"""Outbound calls: the app dials a number, the customer picks up, the AI starts talking."""

import pytest
from twilio.base.exceptions import TwilioRestException

from app.config.settings import get_settings
from app.services.telephony.twilio import calls as twilio_calls


@pytest.fixture
def twilio(monkeypatch):
    """Twilio configured, with a fake that records who was dialled instead of placing real calls."""
    monkeypatch.setenv("CALL_PROVIDER", "twilio")
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC1")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "")  # empty: webhook signatures aren't checked
    monkeypatch.setenv("TWILIO_PHONE_NUMBER", "+15550000000")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.ngrok.app")
    get_settings.cache_clear()
    monkeypatch.setattr(twilio_calls, "twilio_configured", lambda: True)
    dialled, hung_up = [], []

    async def dial_customer(call):
        dialled.append(call)
        return f"CA_out_{len(dialled)}"

    async def hang_up(call):
        hung_up.append(call.twilio_call_sid)

    monkeypatch.setattr(twilio_calls, "dial_customer", dial_customer)
    monkeypatch.setattr(twilio_calls, "hang_up", hang_up)
    return dialled, hung_up


def dial(client, to="+919876543210", purpose="your order ORD-1001 delivery"):
    res = client.post("/calls/outbound", json={"to": to, "purpose": purpose})
    assert res.status_code == 200, res.text
    return res.json()


def test_dials_the_number_and_ai_speaks_first_on_pickup(client, twilio):
    dialled, _ = twilio
    call = dial(client)
    assert call["direction"] == "outbound" and call["fromNumber"] == "+919876543210"
    assert call["twilioCallSid"] == "CA_out_1" and call["status"] == "ai_active"
    assert dialled[0].id == call["id"]

    xml = client.post(f"/twilio/outbound?call_id={call['id']}", data={"CallSid": "CA_out_1"}).text
    assert "<Gather" in xml and "calling about your order ORD-1001 delivery" in xml
    transcript = client.get(f"/calls/{call['id']}").json()["transcript"]
    assert [t["speaker"] for t in transcript] == ["ai"]


def test_customer_reply_goes_through_the_ai_with_outbound_context(client, twilio, fakes):
    call = dial(client)
    client.post(f"/twilio/outbound?call_id={call['id']}", data={})
    xml = client.post(f"/twilio/gather?call_id={call['id']}", data={"SpeechResult": "yes, go ahead"}).text
    assert "Your order is out for delivery." in xml
    assert fakes.calls[0].startswith("[Call details: outbound call you placed to +919876543210")
    assert "Reason for the call: your order ORD-1001 delivery" in fakes.calls[0]


def test_twilio_retry_of_pickup_repeats_the_opener(client, twilio):
    call = dial(client)
    first = client.post(f"/twilio/outbound?call_id={call['id']}", data={}).text
    again = client.post(f"/twilio/outbound?call_id={call['id']}", data={}).text
    assert first == again
    assert len(client.get(f"/calls/{call['id']}").json()["transcript"]) == 1


def test_no_answer_ends_the_call_with_a_note(client, twilio):
    call = dial(client)
    client.post(f"/twilio/status?call_id={call['id']}", data={"CallStatus": "no-answer", "CallSid": "CA_out_1"})
    ended = client.get(f"/calls/{call['id']}").json()
    assert ended["status"] == "ended"
    assert ended["transcript"][-1] == {**ended["transcript"][-1], "speaker": "system", "text": "Nobody answered."}


def test_hang_up_from_the_app(client, twilio):
    _, hung_up = twilio
    call = dial(client)
    res = client.post(f"/calls/{call['id']}/hangup").json()
    assert res["status"] == "ended" and hung_up == ["CA_out_1"]
    # Twilio then fetches the pickup URL or reports completion: nothing is said, nothing breaks
    assert "<Hangup" in client.post(f"/twilio/outbound?call_id={call['id']}", data={}).text


def test_twilio_error_is_reported_and_call_closed(client, twilio, monkeypatch):
    async def fail(call):
        raise TwilioRestException(400, "uri", msg="The number +91987 is unverified")

    monkeypatch.setattr(twilio_calls, "dial_customer", fail)
    res = client.post("/calls/outbound", json={"to": "+919876543210"})
    assert res.status_code == 424 and "unverified" in res.json()["detail"]
    assert client.get("/calls").json()[0]["status"] == "ended"


def test_rejects_bad_numbers_and_unconfigured_twilio(client, monkeypatch):
    monkeypatch.setenv("CALL_PROVIDER", "twilio")
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "")
    get_settings.cache_clear()
    assert client.post("/calls/outbound", json={"to": "98765"}).status_code == 422
    res = client.post("/calls/outbound", json={"to": "+919876543210"})
    assert res.status_code == 503
