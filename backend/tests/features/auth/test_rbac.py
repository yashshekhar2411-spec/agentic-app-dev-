"""Advanced roles and access: ranks, exclusive super admin powers, fine-grained permissions, custom roles,
temporary access, suspend / replace, invites and the audit log."""

from datetime import timedelta

import pytest

from app.config.settings import get_settings
from app.features.auth import security
from app.utils.api_model import now
from tests.conftest import running
from tests.features.auth.test_auth import as_user, fake_verify

SERVICE = {"Authorization": "Bearer service-secret"}


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("API_TOKEN", "service-secret")
    monkeypatch.setattr(security, "_verify_firebase_token", fake_verify)
    get_settings.cache_clear()
    from app.main import create_app

    with running(create_app()) as c:
        yield c


def join(client, uid, phone):
    res = client.post("/humans/register", json={"name": uid.title(), "phone": phone}, headers=as_user(uid))
    assert res.status_code == 200, res.text
    return res.json()


def patch(client, by, member, **body):
    return client.patch(f"/rbac/members/{member['id']}", json=body, headers=as_user(by))


def perms(client, uid):
    return set(client.get("/rbac/me", headers=as_user(uid)).json()["permissions"])


@pytest.fixture
def team(app):
    """owner (first to sign up: super admin), ada (made admin), uma and ulf (users)."""
    owner = join(app, "owner", "+911111111111")
    ada = join(app, "ada", "+912222222222")
    uma = join(app, "uma", "+913333333333")
    ulf = join(app, "ulf", "+914444444444")
    assert patch(app, "owner", ada, role="admin").status_code == 200
    return app, owner, ada, uma, ulf


# ---- the hierarchy ----

def test_super_admin_has_everything_including_exclusive_powers(team):
    client, *_ = team
    owner = perms(client, "owner")
    assert {"roles.manage", "admins.manage", "audit.view"} <= owner
    assert not {"roles.manage", "admins.manage", "audit.view"} & perms(client, "ada")  # admin: never
    assert "team.manage" in perms(client, "ada")
    assert "team.view" not in perms(client, "uma")


def test_exclusive_powers_can_never_be_given(team):
    client, _, ada, *_ = team
    res = patch(client, "owner", ada, grants={"audit.view": {"allow": True}})
    assert res.status_code == 422 and "exclusive" in res.json()["detail"]
    res = client.patch("/rbac/roles/admin", json={"permissions": ["roles.manage"]}, headers=as_user("owner"))
    assert res.status_code == 422


def test_admin_manages_users_but_never_admins_or_super_admins(team):
    client, owner, ada, uma, _ = team
    assert patch(client, "ada", uma, grants={"insights.view": {"allow": True}}).status_code == 200
    assert patch(client, "ada", uma, role="admin").status_code == 403  # can't make admins
    assert patch(client, "ada", owner, role="user").status_code == 403
    assert client.post(f"/rbac/members/{owner['id']}/suspend", headers=as_user("ada")).status_code == 403
    assert client.get("/rbac/audit", headers=as_user("ada")).status_code == 403


def test_users_cant_manage_anyone(team):
    client, _, _, uma, ulf = team
    assert patch(client, "uma", ulf, role="user").status_code == 403
    assert client.get("/rbac/members", headers=as_user("uma")).status_code == 403


def test_no_one_changes_themselves_and_a_super_admin_always_remains(team):
    client, owner, ada, *_ = team
    assert patch(client, "owner", owner, role="user").status_code == 403
    assert patch(client, "ada", ada, grants={"insights.view": {"allow": True}}).status_code == 403
    assert client.post(f"/rbac/members/{owner['id']}/suspend", headers=SERVICE).status_code == 409  # the only super admin


# ---- fine-grained permissions ----

def test_fine_grained_permissions_are_enforced(team):
    client, *_ = team
    # Users may place calls and write notes, see contacts but not block or delete them, no campaigns
    assert client.get("/contacts", headers=as_user("uma")).status_code == 200
    assert client.put("/contacts/%2B919876543210", json={"blocked": True}, headers=as_user("uma")).status_code == 403
    assert client.put("/contacts/%2B919876543210", json={"name": "x"}, headers=as_user("uma")).status_code == 403
    res = client.post("/scheduled", json={"numbers": ["+919876543210", "+14155550100"]}, headers=as_user("uma"))
    assert res.status_code == 403 and "campaigns" in res.json()["detail"]
    assert client.get("/agent-config", headers=as_user("uma")).status_code == 403
    assert client.post("/simulate/calls", json={}, headers=as_user("uma")).status_code == 403


def test_allow_and_deny_single_permissions(team):
    client, _, ada, uma, ulf = team
    patch(client, "ada", uma, grants={"contacts.block": {"allow": True}, "dialer.call": {"allow": False}})
    assert client.put("/contacts/%2B919876543210", json={"blocked": True}, headers=as_user("uma")).status_code == 200
    assert client.post("/calls/outbound", json={"to": "+919876543210"}, headers=as_user("uma")).status_code == 403
    assert "contacts.block" not in perms(client, "ulf")  # only uma
    patch(client, "ada", uma, grants={"dialer.call": None})  # back to the role
    assert "dialer.call" in perms(client, "uma")


def test_temporary_access_expires(team, monkeypatch):
    client, _, _, uma, _ = team
    patch(client, "owner", uma, grants={"insights.view": {"allow": True, "expiresInHours": 1}})
    assert "insights.view" in perms(client, "uma")
    from app.features.auth import rbac

    later = now() + timedelta(hours=2)
    monkeypatch.setattr(rbac, "now", lambda: later)
    assert "insights.view" not in perms(client, "uma")


def test_no_privilege_escalation(team):
    client, _, ada, uma, _ = team
    # The owner takes campaigns away from ada; ada then can't hand campaigns to uma
    patch(client, "owner", ada, grants={"scheduling.campaigns": {"allow": False}})
    res = patch(client, "ada", uma, grants={"scheduling.campaigns": {"allow": True}})
    assert res.status_code == 403 and "don't have it yourself" in res.json()["detail"]


# ---- roles ----

def test_custom_roles_rank_between_admin_and_user(team):
    client, _, ada, uma, ulf = team
    res = client.post("/rbac/roles", json={"label": "Supervisor", "permissions": ["calls.view", "handoffs.view", "insights.view", "team.view"]},
                      headers=as_user("owner"))
    assert res.status_code == 200
    sup = next(r for r in res.json()["roles"] if r["label"] == "Supervisor")
    assert 10 < sup["rank"] < 50
    assert patch(client, "ada", uma, role=sup["id"]).status_code == 200  # admins can give it
    assert perms(client, "uma") == {"calls.view", "handoffs.view", "insights.view", "team.view"}
    assert patch(client, "uma", ulf, role="user").status_code == 403  # no team.manage
    # Deleting the role moves its people back to User
    client.delete(f"/rbac/roles/{sup['id']}", headers=as_user("owner"))
    assert client.get("/rbac/me", headers=as_user("uma")).json()["role"] == "user"


def test_only_super_admins_edit_roles(team):
    client, *_ = team
    assert client.post("/rbac/roles", json={"label": "X"}, headers=as_user("ada")).status_code == 403
    res = client.patch("/rbac/roles/user", json={"permissions": ["calls.view"]}, headers=as_user("owner"))
    assert res.status_code == 200
    assert perms(client, "uma") == {"calls.view"}
    client.post("/rbac/roles/user/reset", headers=as_user("owner"))
    assert "dialer.call" in perms(client, "uma")
    assert client.patch("/rbac/roles/super_admin", json={"permissions": []}, headers=as_user("owner")).status_code == 422


# ---- suspend, replace ----

def test_suspended_accounts_can_use_nothing(team):
    client, _, ada, uma, _ = team
    assert client.post(f"/rbac/members/{uma['id']}/suspend", headers=as_user("ada")).status_code == 200
    res = client.get("/calls", headers=as_user("uma"))
    assert res.status_code == 403 and "suspended" in res.json()["detail"]
    assert client.get("/rbac/me", headers=as_user("uma")).json()["suspended"] is True
    with pytest.raises(Exception):
        with client.websocket_connect("/ws?token=user:uma") as ws:
            ws.receive_json()
    client.post(f"/rbac/members/{uma['id']}/reactivate", headers=as_user("ada"))
    assert client.get("/calls", headers=as_user("uma")).status_code == 200


def test_admin_replaces_a_user(team):
    client, _, ada, uma, ulf = team
    patch(client, "ada", uma, grants={"insights.view": {"allow": True}})
    res = client.post(f"/rbac/members/{uma['id']}/replace", json={"replacementId": ulf["id"]}, headers=as_user("ada"))
    assert res.status_code == 200
    old, new = res.json()
    assert old["human"]["accountState"] == "suspended"
    assert "insights.view" in new["permissions"]  # ulf took over uma's access
    # Admins can't replace an admin
    assert client.post(f"/rbac/members/{ada['id']}/replace", json={"replacementId": ulf["id"]}, headers=as_user("ada")).status_code == 403


# ---- invites, audit ----

def test_invite_gives_the_role_at_sign_up(team):
    client, *_ = team
    res = client.post("/rbac/invites", json={"email": "Newbie@Example.com", "role": "user"}, headers=as_user("ada"))
    assert res.status_code == 200
    assert client.post("/rbac/invites", json={"email": "boss@example.com", "role": "admin"}, headers=as_user("ada")).status_code == 403
    client.post("/rbac/invites", json={"email": "boss@example.com", "role": "admin"}, headers=as_user("owner"))
    assert join(client, "boss", "+915555555555")["role"] == "admin"
    statuses = {i["email"]: i["status"] for i in client.get("/rbac/invites", headers=as_user("owner")).json()}
    assert statuses == {"boss@example.com": "accepted", "newbie@example.com": "pending"}


def test_every_change_is_in_the_audit_log(team):
    client, _, ada, uma, _ = team
    patch(client, "ada", uma, grants={"insights.view": {"allow": True, "expiresInHours": 24}})
    client.post(f"/rbac/members/{uma['id']}/suspend", headers=as_user("ada"))
    entries = client.get("/rbac/audit", headers=as_user("owner")).json()["entries"]
    actions = [(e["actorName"], e["action"], e["targetName"]) for e in entries]
    assert ("Ada", "member.suspended", "Uma") in actions
    assert ("Ada", "access.allowed", "Uma") in actions
    assert ("Owner", "role.changed", "Ada") in actions
    allowed = next(e for e in entries if e["action"] == "access.allowed")
    assert "See insights until" in allowed["detail"]


def test_catalog(team):
    client, *_ = team
    cat = client.get("/rbac/catalog", headers=as_user("uma")).json()
    ids = {p["id"] for p in cat["permissions"]}
    assert {"contacts.block", "scheduling.campaigns", "calls.export", "audit.view"} <= ids
    assert {p["id"] for p in cat["permissions"] if p["superOnly"]} == {"roles.manage", "admins.manage", "audit.view"}
    assert [r["id"] for r in cat["roles"]][:1] == ["super_admin"]


# ---- adding super admins ----

def test_super_admin_makes_another_super_admin(team):
    client, owner, ada, uma, _ = team
    assert patch(client, "owner", uma, role="super_admin").status_code == 200
    assert {"roles.manage", "admins.manage", "audit.view"} <= perms(client, "uma")
    # The new super admin has the full powers, including over the first one (but not over themselves)
    assert patch(client, "uma", ada, role="user").status_code == 200
    assert patch(client, "uma", uma, role="user").status_code == 403
    # With two super admins, one can step the other down
    assert patch(client, "uma", owner, role="admin").status_code == 200
    assert patch(client, "owner", uma, role="user").status_code == 403  # owner is an admin now


def test_admins_cant_make_super_admins(team):
    client, _, ada, uma, _ = team
    assert patch(client, "ada", uma, role="super_admin").status_code == 403
    assert client.post("/rbac/super-admins", json={"email": "x@example.com"}, headers=as_user("ada")).status_code == 403


def test_listed_super_admins_switch_off_first_sign_up(app, monkeypatch):
    monkeypatch.setenv("SUPER_ADMIN_EMAILS", "boss@example.com")
    get_settings.cache_clear()
    assert join(app, "early", "+911111111111")["role"] == "user"  # first, but not on the list
    assert join(app, "boss", "+912222222222")["role"] == "super_admin"


def test_invites_never_linger(app, monkeypatch):
    join(app, "owner", "+911111111111")
    monkeypatch.setenv("SUPER_ADMIN_EMAILS", "boss@example.com")
    get_settings.cache_clear()
    # No invite for someone who is already a super admin in the settings
    res = app.post("/rbac/invites", json={"email": "boss@example.com", "role": "admin"}, headers=as_user("owner"))
    assert res.status_code == 409 and "server settings" in res.json()["detail"]
    # An invite is used up at sign-up even when the settings decide the role
    monkeypatch.setenv("SUPER_ADMIN_EMAILS", "")
    get_settings.cache_clear()
    app.post("/rbac/invites", json={"email": "boss@example.com", "role": "user"}, headers=as_user("owner"))
    monkeypatch.setenv("SUPER_ADMIN_EMAILS", "boss@example.com")
    get_settings.cache_clear()
    assert join(app, "boss", "+912222222222")["role"] == "super_admin"
    statuses = [i["status"] for i in app.get("/rbac/invites", headers=as_user("owner")).json()]
    assert statuses == ["accepted"]
    # Clearing removes finished invites
    app.post("/rbac/invites", json={"email": "gone@example.com"}, headers=as_user("owner"))
    left = app.post("/rbac/invites/clear", headers=as_user("owner")).json()
    assert [i["email"] for i in left] == ["gone@example.com"]


def test_listed_email_is_shown_as_super_admin_in_the_team(app, monkeypatch):
    join(app, "first", "+911111111111")
    later = join(app, "later", "+912222222222")
    assert later["role"] == "user"
    monkeypatch.setenv("SUPER_ADMIN_EMAILS", "later@example.com")  # added to the settings afterwards
    get_settings.cache_clear()
    app.get("/rbac/me", headers=as_user("later"))
    team = {m["human"]["name"]: m["human"]["role"] for m in app.get("/rbac/members", headers=as_user("later")).json()}
    assert team["Later"] == "super_admin"


# ---- super admins by email ----

def test_add_a_super_admin_by_email_before_they_sign_in(team):
    client, *_ = team
    res = client.post("/rbac/super-admins", json={"email": "Partner@Example.com"}, headers=as_user("owner"))
    assert res.status_code == 200
    assert any(e["email"] == "partner@example.com" and not e["humanId"] for e in res.json())
    assert join(client, "partner", "+917777777777")["role"] == "super_admin"  # straight away, no invite


def test_add_a_super_admin_by_email_who_is_already_on_the_team(team):
    client, _, _, uma, _ = team
    client.post("/rbac/super-admins", json={"email": "uma@example.com"}, headers=as_user("owner"))
    assert "admins.manage" in perms(client, "uma")
    # Removing them makes them an Admin
    client.delete("/rbac/super-admins/uma@example.com", headers=as_user("owner"))
    assert client.get("/rbac/me", headers=as_user("uma")).json()["role"] == "admin"


def test_only_super_admins_add_super_admins_and_owners_stay(team, monkeypatch):
    client, *_ = team
    assert client.post("/rbac/super-admins", json={"email": "x@example.com"}, headers=as_user("ada")).status_code == 403
    monkeypatch.setenv("SUPER_ADMIN_EMAILS", "owner@example.com")
    get_settings.cache_clear()
    entries = client.get("/rbac/super-admins", headers=as_user("owner")).json()
    assert entries[0] == {**entries[0], "email": "owner@example.com", "owner": True}
    assert client.delete("/rbac/super-admins/owner@example.com", headers=as_user("owner")).status_code == 403


def test_super_admins_arent_invited(team):
    client, *_ = team
    res = client.post("/rbac/invites", json={"email": "x@example.com", "role": "super_admin"}, headers=as_user("owner"))
    assert res.status_code == 422 and "Super admins" in res.json()["detail"]
