"""Twilio webhook flow: incoming call -> speech turns -> hold queue -> voicemail."""

def incoming(client, sid="CA123"):
    res = client.post("/twilio/voice", data={"CallSid": sid, "From": "+919876543210"})
    assert res.status_code == 200
    return res.text


def call_id_for(client, sid="CA123"):
    return next(c["id"] for c in client.get("/calls").json() if c["twilioCallSid"] == sid)


def test_incoming_call_greets_and_listens(client):
    xml = incoming(client)
    assert "<Gather" in xml and 'input="speech"' in xml
    assert "thanks for calling" in xml


def test_speech_turn_replies_and_keeps_listening(client):
    incoming(client)
    xml = client.post(f"/twilio/gather?call_id={call_id_for(client)}", data={"SpeechResult": "where is my order"}).text
    assert "Your order is out for delivery." in xml
    assert "<Gather" in xml


def test_handoff_puts_caller_on_hold(client):
    incoming(client)
    cid = call_id_for(client)
    xml = client.post(f"/twilio/gather?call_id={cid}", data={"SpeechResult": "I want a refund"}).text
    assert f"<Enqueue" in xml and f">{cid}</Enqueue>" in xml

    hold = client.post(f"/twilio/hold?call_id={cid}", data={"QueueTime": "10"}).text
    assert "<Play>" in hold


def test_long_hold_goes_to_voicemail(client):
    incoming(client)
    cid = call_id_for(client)
    client.post(f"/twilio/gather?call_id={cid}", data={"SpeechResult": "I want a refund"})

    assert "<Leave" in client.post(f"/twilio/hold?call_id={cid}", data={"QueueTime": "999"}).text
    xml = client.post(f"/twilio/queue-done?call_id={cid}", data={"QueueResult": "leave"}).text
    assert "<Record" in xml

    client.post(f"/twilio/voicemail?call_id={cid}", data={"RecordingUrl": "https://example.com/r.mp3"})
    call = client.get(f"/calls/{cid}").json()
    assert call["status"] == "voicemail" and call["voicemailUrl"] == "https://example.com/r.mp3"
    assert client.get("/handoffs").json()[0]["status"] == "expired"


def test_twilio_retry_of_incoming_call_reuses_the_call(client):
    incoming(client)
    assert "<Gather" in incoming(client)
    assert len(client.get("/calls").json()) == 1


def test_end_call_hangs_up(client):
    incoming(client)
    xml = client.post(f"/twilio/gather?call_id={call_id_for(client)}", data={"SpeechResult": "thanks, bye"}).text
    assert "<Hangup" in xml


def test_rejects_unsigned_webhooks(client, monkeypatch):
    from app.config.settings import get_settings

    monkeypatch.setenv("VALIDATE_TWILIO_SIGNATURE", "true")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "secret")
    get_settings.cache_clear()
    res = client.post("/twilio/voice", data={"CallSid": "CA9", "From": "+1"})
    assert res.status_code == 403
