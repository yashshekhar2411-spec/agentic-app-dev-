"""AI agent settings edited from the app: applied to calls at once and kept across restarts."""

import json

import pytest

from app.features.agent import router as agent_config


@pytest.fixture
def saved_file():
    return agent_config.SAVED_FILE  # a temporary file (see conftest)


def test_shows_current_settings_and_choices(client):
    view = client.get("/agent-config").json()
    assert view["config"]["companyName"] == "Acme Support"
    assert "Acme Support" in view["greetingPreview"] and "your recent order" in view["outboundPreview"]
    assert any(v["id"] == "Polly.Aditi" for v in view["voices"])


def test_changes_apply_to_the_next_call_and_are_saved(client, saved_file):
    res = client.patch("/agent-config", json={"companyName": "Buzz Mart", "customGreeting": "  Namaste, Buzz Mart here!  "})
    assert res.status_code == 200, res.text
    assert res.json()["greetingPreview"] == "Namaste, Buzz Mart here!"
    assert json.loads(saved_file.read_text())["company_name"] == "Buzz Mart"

    xml = client.post("/twilio/voice", data={"CallSid": "CA1", "From": "+919876543210"}).text
    assert "Namaste, Buzz Mart here!" in xml


def test_clearing_the_greeting_goes_back_to_the_default(client):
    client.patch("/agent-config", json={"customGreeting": "Hello"})
    view = client.patch("/agent-config", json={"customGreeting": ""}).json()
    assert view["greetingPreview"].startswith("Hi, thanks for calling")


def test_saved_settings_load_at_startup(saved_file):
    from app.config.settings import get_settings

    saved_file.write_text(json.dumps({"company_name": "Saved Co", "hold_timeout_s": 90}))
    agent_config.load_saved()
    assert get_settings().company_name == "Saved Co" and get_settings().hold_timeout_s == 90


@pytest.mark.parametrize(
    "body",
    [{"holdTimeoutS": 5}, {"maxAiTurns": 100}, {"ttsVoice": "Robot"}, {"callLanguage": "fr-FR"}, {"companyName": ""}],
)
def test_rejects_out_of_range_values(client, body):
    assert client.patch("/agent-config", json=body).status_code == 422
