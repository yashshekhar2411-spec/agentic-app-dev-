"""Role-based access, modelled on how Instagram / Meta Business accounts share access.

- Everyone has one role. Roles are ranked: super admin (owner) > admin > custom roles > user.
- A role is a set of fine-grained permissions ("contacts.block", "scheduling.campaigns"...). The super admin
  edits the admin, user and custom roles; the super admin role always has everything.
- Some permissions are exclusive to super admins and can never be given to anyone else (SUPER_ONLY).
- On top of their role a person can be allowed or denied single permissions, permanently or until a time.
- Nobody can act on someone of the same or a higher rank, give a role ranked at or above their own, or give
  a permission they don't have themselves (no privilege escalation).
- A suspended account can't use anything.

The shared API_TOKEN and open dev mode (no auth configured) act as a super admin.
Roles live in backend/roles.json.
"""

import json
import logging
import re
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, Request
from pydantic import Field

from app.config.settings import DATA_DIR, get_settings
from app.features.auth.security import Principal, current_principal
from app.utils.api_model import ApiModel, now

log = logging.getLogger(__name__)

SAVED_FILE = DATA_DIR / "roles.json"
SUPER_ADMINS_FILE = DATA_DIR / "super_admins.json"

SUPER_ADMIN, ADMIN, USER = "super_admin", "admin", "user"
SUPER_RANK, ADMIN_RANK, CUSTOM_RANK, USER_RANK = 100, 50, 30, 10


class Permission(ApiModel):
    id: str
    module: str
    label: str
    description: str
    super_only: bool = False  # can't be given to anyone but super admins


class ModuleGroup(ApiModel):
    id: str
    label: str
    icon: str  # Ionicons name, for the app


MODULES: list[ModuleGroup] = [
    ModuleGroup(id="calls", label="Live calls & history", icon="pulse"),
    ModuleGroup(id="dialer", label="Place calls", icon="keypad"),
    ModuleGroup(id="handoffs", label="Handoff queue", icon="hand-left"),
    ModuleGroup(id="contacts", label="Contacts", icon="people"),
    ModuleGroup(id="scheduling", label="Scheduling & campaigns", icon="alarm"),
    ModuleGroup(id="insights", label="Insights", icon="stats-chart"),
    ModuleGroup(id="ai_agent", label="AI agent", icon="sparkles"),
    ModuleGroup(id="simulator", label="Test calls", icon="chatbubbles"),
    ModuleGroup(id="team", label="Team", icon="people-circle"),
    ModuleGroup(id="security", label="Security (super admin)", icon="shield-checkmark"),
]


def _p(id: str, label: str, description: str, super_only: bool = False) -> Permission:
    return Permission(id=id, module=id.split(".")[0] if not super_only else "security", label=label, description=description, super_only=super_only)


PERMISSIONS: list[Permission] = [
    _p("calls.view", "See calls", "Live and past calls with transcripts"),
    _p("calls.notes", "Write notes", "Notes, tags and outcomes on calls"),
    _p("calls.hangup", "Hang up calls", "End a live call from the app"),
    _p("calls.export", "Share & export", "Share transcripts and export call history"),
    _p("dialer.call", "Place AI calls", "Have the AI call a number"),
    _p("handoffs.view", "See the queue", "Callers waiting for a person"),
    _p("handoffs.take", "Take calls", "Take a caller from the queue"),
    _p("contacts.view", "See contacts", "Names, favourites and the do-not-call list"),
    _p("contacts.edit", "Add & edit contacts", "Create contacts, change names and notes"),
    _p("contacts.block", "Do-not-call list", "Block and unblock numbers"),
    _p("contacts.delete", "Delete contacts", "Remove contacts"),
    _p("scheduling.view", "See scheduled calls", "Upcoming callbacks and campaigns"),
    _p("scheduling.create", "Schedule callbacks", "Schedule a call to one number"),
    _p("scheduling.campaigns", "Run campaigns", "Schedule bulk calls to many numbers"),
    _p("scheduling.cancel", "Cancel & retry", "Cancel, retry, run now and clear scheduled calls"),
    _p("insights.view", "See insights", "Call analytics"),
    _p("ai_agent.view", "See AI settings", "Company name, voice, greeting, hold time"),
    _p("ai_agent.edit", "Change AI settings", "Edit how the AI sounds and behaves"),
    _p("simulator.use", "Run test calls", "Text-based fake calls to try the AI"),
    _p("team.view", "See the team", "Who uses the app and their roles"),
    _p("team.invite", "Invite people", "Invite by email with a role"),
    _p("team.manage", "Manage people", "Change roles and access, suspend and replace people ranked below you"),
    _p("roles.manage", "Edit roles", "Create custom roles and change what every role can do", super_only=True),
    _p("admins.manage", "Manage admins", "Promote, demote, suspend and replace admins and super admins", super_only=True),
    _p("audit.view", "Audit log", "See every change to roles and access", super_only=True),
]
PERMISSION_IDS = [p.id for p in PERMISSIONS]
PERMISSION_INFO = {p.id: p for p in PERMISSIONS}
SUPER_ONLY = {p.id for p in PERMISSIONS if p.super_only}
GRANTABLE = [p for p in PERMISSION_IDS if p not in SUPER_ONLY]


class RoleDef(ApiModel):
    id: str
    label: str
    description: str = ""
    rank: int
    builtin: bool = False
    locked: bool = False  # super admin: always everything
    permissions: list[str] = Field(default_factory=list)


def _builtin_roles() -> dict[str, RoleDef]:
    return {
        SUPER_ADMIN: RoleDef(id=SUPER_ADMIN, label="Super admin", description="Owner. Everything, always, including the exclusive security powers.",
                             rank=SUPER_RANK, builtin=True, locked=True, permissions=list(PERMISSION_IDS)),
        ADMIN: RoleDef(id=ADMIN, label="Admin", description="Runs the team: manages, invites, suspends and replaces users.",
                       rank=ADMIN_RANK, builtin=True, permissions=list(GRANTABLE)),
        USER: RoleDef(id=USER, label="User", description="Day-to-day agent: calls, the queue and callbacks.", rank=USER_RANK, builtin=True,
                      permissions=["calls.view", "calls.notes", "dialer.call", "handoffs.view", "handoffs.take", "contacts.view",
                                   "scheduling.view", "scheduling.create"]),
    }


def clean_permissions(perms: list[str]) -> list[str]:
    """Known, grantable permissions in catalogue order. Raises ValueError on an unknown or exclusive one."""
    for p in perms:
        if p not in PERMISSION_INFO:
            raise ValueError(f"Unknown permission {p!r}")
        if p in SUPER_ONLY:
            raise ValueError(f"“{PERMISSION_INFO[p].label}” is exclusive to super admins")
    wanted = set(perms)
    return [p for p in GRANTABLE if p in wanted]


class RoleBook:
    """Built-in roles (admin and user editable) plus custom roles made by super admins."""

    def __init__(self) -> None:
        self._roles = _builtin_roles()
        self._file = SAVED_FILE

    def load(self, path: Path) -> None:
        self._roles, self._file = _builtin_roles(), path
        if not path.exists():
            return
        try:
            saved = json.loads(path.read_text(encoding="utf-8"))
            for raw in saved.get("roles", []):
                role = RoleDef(**raw)
                if role.id == SUPER_ADMIN:
                    continue
                base = self._roles.get(role.id)
                if base:  # built-in: only its permissions can change
                    base.permissions = clean_permissions(role.permissions)
                else:
                    role.builtin, role.locked, role.rank = False, False, CUSTOM_RANK
                    role.permissions = clean_permissions(role.permissions)
                    self._roles[role.id] = role
            log.info("loaded %d roles from %s", len(self._roles), path.name)
        except (OSError, ValueError, TypeError) as exc:
            log.warning("ignoring %s: %s", path.name, exc)

    def _save(self) -> None:
        data = {"roles": [r.to_wire() for r in self._roles.values() if r.id != SUPER_ADMIN]}
        try:
            self._file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except OSError as exc:
            log.warning("couldn't save roles: %s", exc)

    def all(self) -> list[RoleDef]:
        return sorted((r.model_copy(deep=True) for r in self._roles.values()), key=lambda r: (-r.rank, r.label.lower()))

    def get(self, role_id: str) -> RoleDef | None:
        r = self._roles.get(role_id)
        return r.model_copy(deep=True) if r else None

    def resolve(self, role_id: str) -> RoleDef:
        """The role, or User if it no longer exists (a deleted custom role)."""
        return self.get(role_id) or self.get(USER)  # type: ignore[return-value]

    def set_permissions(self, role_id: str, perms: list[str]) -> RoleDef:
        role = self._roles.get(role_id)
        if role is None:
            raise KeyError(role_id)
        if role.locked:
            raise ValueError("Super admins always have every permission")
        role.permissions = clean_permissions(perms)
        self._save()
        return role.model_copy(deep=True)

    def create(self, label: str, description: str, perms: list[str]) -> RoleDef:
        base = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") or "role"
        role_id, n = base, 2
        while role_id in self._roles:
            role_id, n = f"{base}_{n}", n + 1
        role = RoleDef(id=role_id, label=label.strip(), description=description.strip(), rank=CUSTOM_RANK, permissions=clean_permissions(perms))
        self._roles[role.id] = role
        self._save()
        return role.model_copy(deep=True)

    def update(self, role_id: str, label: str | None, description: str | None) -> RoleDef:
        role = self._roles.get(role_id)
        if role is None:
            raise KeyError(role_id)
        if role.builtin:
            raise ValueError("Built-in roles can't be renamed")
        if label is not None:
            role.label = label.strip()
        if description is not None:
            role.description = description.strip()
        self._save()
        return role.model_copy(deep=True)

    def delete(self, role_id: str) -> None:
        role = self._roles.get(role_id)
        if role is None:
            raise KeyError(role_id)
        if role.builtin:
            raise ValueError("Built-in roles can't be deleted")
        del self._roles[role_id]
        self._save()

    def reset(self, role_id: str) -> RoleDef:
        if role_id not in (ADMIN, USER):
            raise ValueError("Only the Admin and User roles have defaults")
        self._roles[role_id] = _builtin_roles()[role_id]
        self._save()
        return self._roles[role_id].model_copy(deep=True)


roles = RoleBook()


class Grant(ApiModel):
    """One permission given (allow) or taken away (deny) for one person, on top of their role."""

    allow: bool
    expires_at: datetime | None = None  # temporary access: ignored after this time
    by: str = ""  # name of who set it

    def active(self, at: datetime | None = None) -> bool:
        return self.expires_at is None or self.expires_at > (at or now())


def effective(role_id: str, grants: dict[str, Grant] | None = None) -> list[str]:
    """What a person can do: their role, plus allows, minus denies (expired ones ignored), in catalogue order."""
    role = roles.resolve(role_id)
    if role.locked:
        return list(PERMISSION_IDS)
    perms = set(role.permissions)
    t = now()
    for perm, grant in (grants or {}).items():
        if perm in SUPER_ONLY or not grant.active(t):
            continue
        (perms.add if grant.allow else perms.discard)(perm)
    return [p for p in PERMISSION_IDS if p in perms]


class SuperAdminEmail(ApiModel):
    email: str
    added_by: str = ""
    added_at: datetime = Field(default_factory=now)


class SuperAdminEmails:
    """Emails made super admin from the app: super admin as soon as they sign in, no invite needed. Kept in
    backend/super_admins.json. The owners in SUPER_ADMIN_EMAILS (backend/.env) are separate and can't be removed."""

    def __init__(self) -> None:
        self._items: dict[str, SuperAdminEmail] = {}
        self._file = SUPER_ADMINS_FILE

    def load(self, path: Path) -> None:
        self._items, self._file = {}, path
        if not path.exists():
            return
        try:
            for raw in json.loads(path.read_text(encoding="utf-8")):
                item = SuperAdminEmail(**raw)
                self._items[item.email] = item
        except (OSError, ValueError, TypeError) as exc:
            log.warning("ignoring %s: %s", path.name, exc)

    def _save(self) -> None:
        try:
            self._file.write_text(json.dumps([i.to_wire() for i in self._items.values()], indent=1), encoding="utf-8")
        except OSError as exc:
            log.warning("couldn't save super admin emails: %s", exc)

    def all(self) -> list[SuperAdminEmail]:
        return sorted((i.model_copy() for i in self._items.values()), key=lambda i: i.added_at)

    def emails(self) -> set[str]:
        return set(self._items)

    def add(self, email: str, by: str) -> SuperAdminEmail:
        item = self._items.get(email) or SuperAdminEmail(email=email, added_by=by)
        self._items[email] = item
        self._save()
        return item.model_copy()

    def remove(self, email: str) -> bool:
        if self._items.pop(email, None) is None:
            return False
        self._save()
        return True


super_admin_emails = SuperAdminEmails()


def owner_emails() -> set[str]:
    """SUPER_ADMIN_EMAILS from backend/.env: the owners, always super admins, never removable from the app."""
    return {e.strip().lower() for e in get_settings().super_admin_emails.split(",") if e.strip()}


def _listed() -> set[str]:
    return owner_emails() | super_admin_emails.emails()


def super_admins_listed() -> bool:
    """True if any super admin email is set (then nobody becomes super admin just by signing up first)."""
    return bool(_listed())


def is_owner(email: str | None) -> bool:
    return bool(email and email.lower() in owner_emails())


def is_listed_super_admin(email: str | None) -> bool:
    return bool(email and email.lower() in _listed())


class Caller(ApiModel):
    """The signed-in person's access, as the app needs it."""

    role: str
    role_label: str
    rank: int
    human_id: str | None = None
    name: str = ""
    suspended: bool = False
    permissions: list[str]

    def can(self, perm: str) -> bool:
        return not self.suspended and perm in self.permissions


async def caller_access(principal: Principal) -> Caller:
    from app.storage.store import store  # the store imports the profile models, which import this module

    if principal.uid is None:  # the shared API token, or open dev mode
        return Caller(role=SUPER_ADMIN, role_label="Super admin", rank=SUPER_RANK, name="Server", permissions=list(PERMISSION_IDS))
    human = await store.human_by_uid(principal.uid)
    role_id = human.role if human else USER
    if is_listed_super_admin(principal.email):
        role_id = SUPER_ADMIN
        if human and human.role != SUPER_ADMIN:  # keep the stored role in step, so the team list shows it too
            human.role = SUPER_ADMIN
            await store.update_human(human, "role")
    role = roles.resolve(role_id)
    return Caller(
        role=role.id,
        role_label=role.label,
        rank=role.rank,
        human_id=human.id if human else None,
        name=(human.name if human else principal.name or principal.email or ""),
        suspended=bool(human and human.account_state == "suspended"),
        permissions=effective(role.id, human.grants if human else None),
    )


def require(*perms: str):
    """FastAPI dependency: 403 unless the caller is active and has every one of `perms`."""

    async def check(request: Request) -> Caller:
        caller = await caller_access(current_principal(request))
        if caller.suspended:
            raise HTTPException(403, "Your account is suspended: contact your admin")
        missing = [p for p in perms if p not in caller.permissions]
        if missing:
            raise HTTPException(403, f"You don't have permission to {PERMISSION_INFO[missing[0]].label.lower()}: ask an admin")
        request.state.caller = caller
        return caller

    return check


def check_perm(caller: Caller, perm: str) -> None:
    """The same check inside an endpoint, for permissions that depend on what was sent."""
    if not caller.can(perm):
        raise HTTPException(403, f"You don't have permission to {PERMISSION_INFO[perm].label.lower()}: ask an admin")
