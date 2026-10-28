import os
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from app.features.agent import orchestrator
from app.features.agent import router as agent_config
from app.features.auth import rbac, security
from app.features.contacts import store as contact_store
from app.features.schedule import store as schedule_store
from app.features.team import records as team_records
from app.config.settings import get_settings
from app.features.handoff import service
from app.features.agent.models import AgentReply
from app.features.handoff.models import HandoffReason
from app.storage.store import ConversationState


class FakeBrain:
    """Scripted AI: escalates on 'refund', ends on 'bye', otherwise answers."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def respond(self, state: ConversationState, caller_text: str) -> AgentReply:
        self.calls.append(caller_text)
        state.messages.append({"role": "user", "content": caller_text})
        if "refund" in caller_text.lower():
            return AgentReply(
                text="I'll connect you with a colleague.",
                handoff_reason=HandoffReason.AGENT_DECIDED,
                handoff_detail="Caller wants a refund",
            )
        if "bye" in caller_text.lower():
            return AgentReply(text="Goodbye!", end_call=True)
        return AgentReply(text="Your order is out for delivery.")


class FakeSummarizer:
    async def summarize(self, transcript_text: str, reason: str) -> str:
        return f"Summary: {reason}"


@pytest.fixture(autouse=True)
def fakes(monkeypatch, tmp_path):
    monkeypatch.setenv("VALIDATE_TWILIO_SIGNATURE", "false")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "")  # auth is off unless a test turns it on
    monkeypatch.setenv("API_TOKEN", "")
    monkeypatch.setenv("COMPANY_NAME", "Acme Support")  # whatever backend/.env says
    for key in ("API_KEY", "AGENT_ID", "CALLER_ID", "WEBHOOKS_SECRET"):  # never reach the real ElevenLabs account
        monkeypatch.setenv(f"ELEVEN_LABS_{key}", "")
    monkeypatch.setenv("ELEVEN_LABS_POLL_S", "3600")  # tests run the sync themselves
    # In-memory storage whatever backend/.env says, unless TEST_DATABASE_URL / TEST_REDIS_URL point the
    # suite at a throwaway Postgres database / Redis (never your real one: every test wipes it)
    monkeypatch.setenv("DATABASE_URL", os.environ.get("TEST_DATABASE_URL", ""))
    monkeypatch.setenv("REDIS_URL", os.environ.get("TEST_REDIS_URL", ""))
    # Never read or write the real agent_settings.json saved from the app
    monkeypatch.setattr(agent_config, "SAVED_FILE", tmp_path / "agent_settings.json")
    # ...nor the real contacts / scheduled calls
    monkeypatch.setattr(contact_store, "SAVED_FILE", tmp_path / "contacts.json")
    monkeypatch.setattr(schedule_store, "SAVED_FILE", tmp_path / "scheduled_calls.json")
    monkeypatch.setattr(rbac, "SAVED_FILE", tmp_path / "roles.json")
    monkeypatch.setattr(rbac, "SUPER_ADMINS_FILE", tmp_path / "super_admins.json")
    monkeypatch.setattr(team_records, "AUDIT_FILE", tmp_path / "rbac_audit.json")
    monkeypatch.setattr(team_records, "INVITES_FILE", tmp_path / "invites.json")
    monkeypatch.setenv("SUPER_ADMIN_EMAILS", "")
    monkeypatch.setenv("HUMANS_FILE", str(tmp_path / "humans.json"))
    monkeypatch.setenv("SCHEDULE_POLL_S", "3600")  # tests run the scheduler themselves
    get_settings.cache_clear()
    security._verified.clear()
    brain = FakeBrain()
    orchestrator.set_brain(brain)
    monkeypatch.setattr(service, "_summarizer", FakeSummarizer())
    yield brain
    orchestrator.set_brain(None)
    get_settings.cache_clear()


@contextmanager
def running(app):
    """Start the app (lifespan included) on empty storage."""
    from app.storage.store import store

    with TestClient(app) as c:
        if store.kind == "postgres":
            c.portal.call(store.impl.reset)
        yield c


@pytest.fixture
def client():
    from app.main import app

    with running(app) as c:
        yield c
