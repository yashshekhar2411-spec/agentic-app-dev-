"""API auth: Firebase ID tokens for agents, the shared API token for scripts, ownership of profiles."""

import jwt
import pytest

from app.features.auth import security
from app.config.settings import get_settings
from tests.conftest import running


def fake_verify(token: str, project_id: str) -> dict:
    # Test tokens look like "user:<uid>"; anything else is rejected like a bad signature would be
    if not token.startswith("user:"):
        raise jwt.InvalidSignatureError("bad token")
    uid = token.split(":", 1)[1]
    return {"sub": uid, "email": f"{uid}@example.com", "aud": project_id}


@pytest.fixture
def secured(monkeypatch):
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("API_TOKEN", "service-secret")
    monkeypatch.setattr(security, "_verify_firebase_token", fake_verify)
    get_settings.cache_clear()
    from app.main import create_app

    with running(create_app()) as c:
        yield c


def as_user(uid: str) -> dict:
    return {"Authorization": f"Bearer user:{uid}"}


def register(client, uid, phone="+911111111111", name="Asha"):
    return client.post("/humans/register", json={"name": name, "phone": phone}, headers=as_user(uid))


def test_requests_without_credentials_are_rejected(secured):
    assert secured.get("/calls").status_code == 401
    assert secured.get("/calls", headers={"Authorization": "Bearer nonsense"}).status_code == 401


def test_health_stays_open(secured):
    assert secured.get("/health").status_code == 200


def test_firebase_user_and_service_token_are_accepted(secured):
    assert secured.get("/calls", headers=as_user("u1")).status_code == 200
    assert secured.get("/calls", headers={"Authorization": "Bearer service-secret"}).status_code == 200


def test_profile_is_linked_to_the_firebase_account(secured):
    human = register(secured, "u1").json()
    assert human["uid"] == "u1" and human["email"] == "u1@example.com"

    assert secured.get("/humans/me", headers=as_user("u1")).json()["id"] == human["id"]
    assert secured.get("/humans/me", headers=as_user("u2")).status_code == 404

    # Signing in again (even with a new number) updates the same profile
    again = register(secured, "u1", phone="+913333333333", name="Asha V").json()
    assert again["id"] == human["id"] and again["phone"] == "+913333333333"


def test_cannot_act_as_someone_else(secured):
    asha = register(secured, "u1").json()
    assert register(secured, "u2", phone="+911111111111").status_code == 409  # Asha's number

    res = secured.patch(f"/humans/{asha['id']}/status", json={"status": "online"}, headers=as_user("u2"))
    assert res.status_code == 403
    res = secured.post("/handoffs/hof_x/accept", json={"humanId": asha["id"]}, headers=as_user("u2"))
    assert res.status_code == 403


def test_websocket_needs_a_token(secured):
    with pytest.raises(Exception):
        with secured.websocket_connect("/ws") as ws:
            ws.receive_json()
    with secured.websocket_connect("/ws?token=user:u1") as ws:
        assert ws.receive_json()["type"] == "snapshot"


def test_invalid_phone_is_rejected(secured):
    assert register(secured, "u1", phone="12345").status_code == 422
