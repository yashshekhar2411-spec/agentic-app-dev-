"""Contacts, the do-not-call list, call notes, and scheduled calls / campaigns."""

from datetime import datetime, timedelta, timezone

import pytest

from app.config.settings import get_settings
from app.features.schedule import runner
from app.services.telephony.twilio import calls as twilio_calls


@pytest.fixture
def dialled(monkeypatch):
    """Twilio configured, with a fake that records who was dialled instead of placing real calls."""
    monkeypatch.setenv("CALL_PROVIDER", "twilio")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.ngrok.app")
    get_settings.cache_clear()
    monkeypatch.setattr(twilio_calls, "twilio_configured", lambda: True)
    numbers = []

    async def dial_customer(call):
        numbers.append(call.from_number)
        return f"CA_sched_{len(numbers)}"

    monkeypatch.setattr(twilio_calls, "dial_customer", dial_customer)
    return numbers


def run_scheduler(client):
    return client.portal.call(runner.run_due)


def test_contact_is_saved_listed_and_deleted(client):
    res = client.put("/contacts/%2B919876543210", json={"name": " Asha ", "favorite": True})
    assert res.status_code == 200 and res.json()["name"] == "Asha"
    client.put("/contacts/%2B14155550100", json={"name": "Bob"})
    names = [c["name"] for c in client.get("/contacts").json()]
    assert names == ["Asha", "Bob"]  # favourites first
    assert client.delete("/contacts/%2B14155550100").status_code == 200
    assert client.delete("/contacts/%2B14155550100").status_code == 404
    assert client.put("/contacts/12345", json={"name": "x"}).status_code == 422


def test_blocked_number_is_never_called(client, dialled):
    client.put("/contacts/%2B919876543210", json={"blocked": True})
    res = client.post("/calls/outbound", json={"to": "+919876543210"})
    assert res.status_code == 403 and "do-not-call" in res.json()["detail"]
    assert dialled == []


def test_notes_tags_and_outcome_are_saved(client, dialled):
    call = client.post("/calls/outbound", json={"to": "+919876543210"}).json()
    res = client.patch(f"/calls/{call['id']}", json={"notes": " wants a demo ", "tags": ["VIP", "vip", " Demo "], "disposition": "interested"})
    assert res.status_code == 200
    saved = client.get(f"/calls/{call['id']}").json()
    assert saved["notes"] == "wants a demo"
    assert saved["tags"] == ["vip", "demo"]
    assert saved["disposition"] == "interested"
    # Only what is sent changes
    client.patch(f"/calls/{call['id']}", json={"notes": ""})
    saved = client.get(f"/calls/{call['id']}").json()
    assert saved["notes"] == "" and saved["tags"] == ["vip", "demo"]
    assert client.patch(f"/calls/{call['id']}", json={"disposition": "nope"}).status_code == 422


def test_due_calls_are_placed_and_future_ones_wait(client, dialled):
    later = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    client.post("/scheduled", json={"numbers": ["+919876543210"], "purpose": "a callback"})
    client.post("/scheduled", json={"numbers": ["+14155550100"], "runAt": later})
    assert run_scheduler(client) == 1
    assert dialled == ["+919876543210"]
    items = {i["to"]: i for i in client.get("/scheduled").json()}
    placed = items["+919876543210"]
    assert placed["status"] == "placed" and placed["callId"]
    assert client.get(f"/calls/{placed['callId']}").json()["purpose"] == "a callback"
    assert items["+14155550100"]["status"] == "scheduled"


def test_campaign_spaces_calls_and_skips_blocked_numbers(client, dialled):
    client.put("/contacts/%2B14155550101", json={"blocked": True})
    res = client.post(
        "/scheduled",
        json={"numbers": ["+919876543210", "+14155550101", "+14155550100", "+919876543210"], "spacingS": 120, "name": "Renewals"},
    )
    items = res.json()
    assert [i["to"] for i in items] == ["+919876543210", "+14155550100"]  # blocked and duplicate left out
    assert items[0]["batchId"] and items[0]["batchId"] == items[1]["batchId"]
    gap = datetime.fromisoformat(items[1]["runAt"]) - datetime.fromisoformat(items[0]["runAt"])
    assert gap == timedelta(seconds=120)

    cancelled = client.post(f"/scheduled/batch/{items[0]['batchId']}/cancel").json()
    assert len(cancelled) == 2
    assert run_scheduler(client) == 0 and dialled == []


def test_cancel_and_run_now(client, dialled):
    later = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    item = client.post("/scheduled", json={"numbers": ["+919876543210"], "runAt": later}).json()[0]
    assert client.post(f"/scheduled/{item['id']}/cancel").json()["status"] == "cancelled"
    assert client.post(f"/scheduled/{item['id']}/cancel").status_code == 409
    ran = client.post(f"/scheduled/{item['id']}/run-now").json()
    assert ran["status"] == "placed" and dialled == ["+919876543210"]
    assert client.post("/scheduled/clear-finished").json()["removed"] == 1


def test_failed_call_is_reported(client, monkeypatch):
    monkeypatch.setenv("CALL_PROVIDER", "twilio")
    get_settings.cache_clear()
    monkeypatch.setattr(twilio_calls, "twilio_configured", lambda: False)
    client.post("/scheduled", json={"numbers": ["+919876543210"]})
    run_scheduler(client)
    item = client.get("/scheduled").json()[0]
    assert item["status"] == "failed" and "Twilio isn't set up" in item["error"]


def test_bad_numbers_are_rejected(client):
    res = client.post("/scheduled", json={"numbers": ["98765"]})
    assert res.status_code == 422
