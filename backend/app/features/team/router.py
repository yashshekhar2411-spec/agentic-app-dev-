"""Roles and access from the app: my access, roles (built-in and custom), team members, invites, audit log.

Rules (see app/features/auth/rbac.py): you can only act on people ranked below you (admins and super admins:
super admins only), only give roles ranked below your own, and only give permissions you have yourself.
Nobody changes their own role or access, and there is always at least one active super admin.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field

from app.features.auth.rbac import (
    ADMIN_RANK,
    MODULES,
    PERMISSION_IDS,
    PERMISSIONS,
    SUPER_ADMIN,
    SUPER_ONLY,
    USER,
    Caller,
    Grant,
    ModuleGroup,
    Permission,
    RoleDef,
    caller_access,
    effective,
    SuperAdminEmail,
    is_listed_super_admin,
    is_owner,
    owner_emails,
    require,
    roles,
    super_admin_emails,
)
from app.features.auth.security import current_principal
from app.features.profile.models import Human
from app.features.team.records import AuditEntry, Invite, audit, invites
from app.services.realtime.bus import bus
from app.storage.store import store
from app.utils.api_model import ApiModel, now

router = APIRouter(prefix="/rbac", tags=["rbac"])


# ---- models ----

class Catalog(ApiModel):
    modules: list[ModuleGroup]
    permissions: list[Permission]
    roles: list[RoleDef]


class Member(ApiModel):
    human: Human
    role_label: str
    rank: int
    permissions: list[str]  # role + active grants
    manageable: bool  # can the caller change this person


class RoleCreate(ApiModel):
    label: str = Field(min_length=2, max_length=40)
    description: str = Field(default="", max_length=200)
    permissions: list[str] = Field(default_factory=list)


class RoleUpdate(ApiModel):
    label: str | None = Field(default=None, min_length=2, max_length=40)
    description: str | None = Field(default=None, max_length=200)
    permissions: list[str] | None = None


class GrantChange(ApiModel):
    allow: bool
    expires_in_hours: float | None = Field(default=None, gt=0, le=24 * 365)  # temporary access; None = permanent


class MemberUpdate(ApiModel):
    role: str | None = None
    # A permission set to null goes back to what the person's role gives
    grants: dict[str, GrantChange | None] | None = None


class ReplaceRequest(ApiModel):
    replacement_id: str


class SuperAdminAdd(ApiModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=120)


class SuperAdminEntry(ApiModel):
    email: str
    owner: bool  # from the server settings: can't be removed from the app
    added_by: str = ""
    added_at: datetime | None = None
    human_id: str | None = None  # their team profile, once they've signed in
    name: str = ""


class InviteCreate(ApiModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=120)
    role: str = USER


# ---- helpers ----

async def _caller(request: Request) -> Caller:
    return await caller_access(current_principal(request))


def _rank(role_id: str) -> int:
    return roles.resolve(role_id).rank


def _can_act_on(caller: Caller, target: Human) -> str | None:
    """Why the caller can't change `target`, or None if they can."""
    if caller.human_id == target.id:
        return "You can't change your own role or access: ask another admin"
    target_rank = _rank(target.role)
    if target_rank >= ADMIN_RANK:
        return None if caller.can("admins.manage") else "Only a super admin can change admins and super admins"
    if caller.rank <= target_rank:
        return "You can only change people ranked below you"
    return None


def _can_give_role(caller: Caller, role: RoleDef) -> str | None:
    if role.rank >= ADMIN_RANK:
        return None if caller.can("admins.manage") else "Only a super admin can make someone an admin or super admin"
    if role.rank >= caller.rank:
        return "You can only give roles ranked below your own"
    return None


def _forbid(reason: str | None) -> None:
    if reason:
        raise HTTPException(403, reason)


def _role_or_404(role_id: str) -> RoleDef:
    role = roles.get(role_id)
    if role is None:
        raise HTTPException(404, "Role not found")
    return role


async def _human_or_404(human_id: str) -> Human:
    human = await store.get_human(human_id)
    if human is None:
        raise HTTPException(404, "Team member not found")
    return human


async def _active_supers(excluding: str | None = None) -> list[Human]:
    return [h for h in await store.list_humans() if h.role == SUPER_ADMIN and h.account_state == "active" and h.id != excluding]


async def _keep_a_super(target: Human) -> None:
    """Refuse a change that would take away the last active super admin."""
    if target.role == SUPER_ADMIN and is_owner(target.email):
        raise HTTPException(409, "This person is the owner super admin (server settings): that can't be changed here")
    if target.role == SUPER_ADMIN and is_listed_super_admin(target.email):
        raise HTTPException(409, "This person was made super admin by email: remove them under Super admins instead")
    if target.role == SUPER_ADMIN and not await _active_supers(excluding=target.id):
        raise HTTPException(409, "There must always be at least one active super admin")


def _member(h: Human, caller: Caller | None = None) -> Member:
    role = roles.resolve(h.role)
    return Member(
        human=h,
        role_label=role.label,
        rank=role.rank,
        permissions=effective(h.role, h.grants),
        manageable=bool(caller and caller.can("team.manage") and _can_act_on(caller, h) is None),
    )


def _catalog() -> Catalog:
    return Catalog(modules=MODULES, permissions=PERMISSIONS, roles=roles.all())


async def _log(caller: Caller, action: str, target: Human | None = None, detail: str = "", target_name: str = "") -> None:
    audit.add(AuditEntry(actor_id=caller.human_id, actor_name=caller.name or "Someone", action=action,
                         target_id=target.id if target else None, target_name=target.name if target else target_name, detail=detail))


async def _changed(human_id: str | None = None, role: str | None = None) -> None:
    await bus.publish("rbac.changed", {k: v for k, v in {"humanId": human_id, "role": role}.items() if v})


def _label(perm: str) -> str:
    return next(p.label for p in PERMISSIONS if p.id == perm)


# ---- my access & catalogue ----

@router.get("/me", response_model=Caller)
async def my_access(request: Request) -> Caller:
    """The signed-in person's role and permissions (the app hides the rest)."""
    return await _caller(request)


@router.get("/catalog", response_model=Catalog)
async def catalog() -> Catalog:
    """Every permission (grouped into modules) and every role with what it allows."""
    return _catalog()


# ---- roles (super admins) ----

@router.post("/roles", response_model=Catalog)
async def create_role(body: RoleCreate, caller: Caller = Depends(require("roles.manage"))) -> Catalog:
    try:
        role = roles.create(body.label, body.description, body.permissions)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    await _log(caller, "role.created", target_name=role.label, detail=f"{len(role.permissions)} permissions")
    await _changed(role=role.id)
    return _catalog()


@router.patch("/roles/{role_id}", response_model=Catalog)
async def update_role(role_id: str, body: RoleUpdate, caller: Caller = Depends(require("roles.manage"))) -> Catalog:
    before = _role_or_404(role_id)
    try:
        if body.label is not None or body.description is not None:
            roles.update(role_id, body.label, body.description)
        if body.permissions is not None:
            after = roles.set_permissions(role_id, body.permissions)
            added = [_label(p) for p in after.permissions if p not in before.permissions]
            removed = [_label(p) for p in before.permissions if p not in after.permissions]
            detail = "; ".join(x for x in [f"added {', '.join(added)}" if added else "", f"removed {', '.join(removed)}" if removed else ""] if x)
            await _log(caller, "role.permissions", target_name=before.label, detail=detail or "no change")
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    await _changed(role=role_id)
    return _catalog()


@router.post("/roles/{role_id}/reset", response_model=Catalog)
async def reset_role(role_id: str, caller: Caller = Depends(require("roles.manage"))) -> Catalog:
    role = _role_or_404(role_id)
    try:
        roles.reset(role_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    await _log(caller, "role.reset", target_name=role.label)
    await _changed(role=role_id)
    return _catalog()


@router.delete("/roles/{role_id}", response_model=Catalog)
async def delete_role(role_id: str, caller: Caller = Depends(require("roles.manage"))) -> Catalog:
    role = _role_or_404(role_id)
    try:
        roles.delete(role_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    moved = [h for h in await store.list_humans() if h.role == role_id]
    for h in moved:  # people in a deleted role become Users
        h.role = USER
        await store.update_human(h, "role")
    await _log(caller, "role.deleted", target_name=role.label, detail=f"{len(moved)} people moved to User" if moved else "")
    await _changed(role=role_id)
    return _catalog()


# ---- members ----

@router.get("/members", response_model=list[Member])
async def list_members(caller: Caller = Depends(require("team.view"))) -> list[Member]:
    humans = sorted(await store.list_humans(), key=lambda h: (-_rank(h.role), h.account_state != "active", h.name.lower()))
    return [_member(h, caller) for h in humans]


@router.patch("/members/{human_id}", response_model=Member)
async def update_member(human_id: str, body: MemberUpdate, caller: Caller = Depends(require("team.manage"))) -> Member:
    """Change someone's role, or allow / deny single permissions for them (optionally for a limited time)."""
    human = await _human_or_404(human_id)
    _forbid(_can_act_on(caller, human))
    fields, notes = [], []

    if body.role is not None and body.role != human.role:
        new_role = _role_or_404(body.role)
        _forbid(_can_give_role(caller, new_role))
        if human.role == SUPER_ADMIN:
            await _keep_a_super(human)
        notes.append(("role.changed", f"{roles.resolve(human.role).label} → {new_role.label}"))
        human.role = new_role.id
        fields.append("role")

    if body.grants is not None:
        grants = dict(human.grants)
        for perm, change in body.grants.items():
            if perm not in PERMISSION_IDS:
                raise HTTPException(422, f"Unknown permission {perm!r}")
            if perm in SUPER_ONLY:
                raise HTTPException(422, f"“{_label(perm)}” is exclusive to super admins")
            if change is None:
                if grants.pop(perm, None) is not None:
                    notes.append(("access.reset", _label(perm)))
                continue
            if perm not in caller.permissions:  # no privilege escalation: only what you have yourself
                raise HTTPException(403, f"You can't give or take away “{_label(perm)}”: you don't have it yourself")
            expires = now() + timedelta(hours=change.expires_in_hours) if change.expires_in_hours else None
            grants[perm] = Grant(allow=change.allow, expires_at=expires, by=caller.name)
            until = f" until {expires:%d %b %H:%M} UTC" if expires else ""
            notes.append(("access.allowed" if change.allow else "access.denied", f"{_label(perm)}{until}"))
        human.grants = grants
        fields.append("grants")

    if fields:
        await store.update_human(human, *fields)
        for action, detail in notes:
            await _log(caller, action, human, detail)
        await _changed(human.id)
    return _member(human, caller)


@router.post("/members/{human_id}/suspend", response_model=Member)
async def suspend_member(human_id: str, caller: Caller = Depends(require("team.manage"))) -> Member:
    human = await _human_or_404(human_id)
    _forbid(_can_act_on(caller, human))
    await _keep_a_super(human)
    human.account_state = "suspended"
    await store.update_human(human, "account_state")
    await _log(caller, "member.suspended", human)
    await _changed(human.id)
    return _member(human, caller)


@router.post("/members/{human_id}/reactivate", response_model=Member)
async def reactivate_member(human_id: str, caller: Caller = Depends(require("team.manage"))) -> Member:
    human = await _human_or_404(human_id)
    _forbid(_can_act_on(caller, human))
    human.account_state = "active"
    await store.update_human(human, "account_state")
    await _log(caller, "member.reactivated", human)
    await _changed(human.id)
    return _member(human, caller)


@router.post("/members/{human_id}/replace", response_model=list[Member])
async def replace_member(human_id: str, body: ReplaceRequest, caller: Caller = Depends(require("team.manage"))) -> list[Member]:
    """Hand someone's role and access to another person, and suspend the one being replaced."""
    old = await _human_or_404(human_id)
    new = await _human_or_404(body.replacement_id)
    if old.id == new.id:
        raise HTTPException(422, "Pick someone else as the replacement")
    _forbid(_can_act_on(caller, old))
    _forbid(_can_act_on(caller, new))
    _forbid(_can_give_role(caller, roles.resolve(old.role)))
    if new.account_state != "active":
        raise HTTPException(409, f"{new.name} is suspended: reactivate them first")
    new.role, new.grants = old.role, dict(old.grants)
    old.account_state = "suspended"
    await store.update_human(new, "role", "grants")
    await store.update_human(old, "account_state")
    await _log(caller, "member.replaced", old, f"by {new.name} ({roles.resolve(new.role).label})")
    await _changed(old.id)
    await _changed(new.id)
    return [_member(old, caller), _member(new, caller)]


# ---- invites ----

@router.get("/invites", response_model=list[Invite])
async def list_invites(_: Caller = Depends(require("team.view"))) -> list[Invite]:
    return invites.all()


@router.post("/invites", response_model=Invite)
async def create_invite(body: InviteCreate, caller: Caller = Depends(require("team.invite"))) -> Invite:
    """Invite someone by email: when they sign up with that email they get this role."""
    role = _role_or_404(body.role)
    if role.id == SUPER_ADMIN:
        raise HTTPException(422, "Super admins don't need an invite: add their email under Super admins instead")
    _forbid(_can_give_role(caller, role))
    email = body.email.strip().lower()
    if any((h.email or "").lower() == email for h in await store.list_humans()):
        raise HTTPException(409, "Someone with this email is already on the team: change their role instead")
    if is_listed_super_admin(email):
        raise HTTPException(409, "This email is already a super admin in the server settings (SUPER_ADMIN_EMAILS): no invite needed")
    invite = invites.add(Invite(email=email, role=role.id, invited_by=caller.name))
    await _log(caller, "invite.created", target_name=email, detail=role.label)
    return invite


@router.post("/invites/{invite_id}/revoke", response_model=Invite)
async def revoke_invite(invite_id: str, caller: Caller = Depends(require("team.invite"))) -> Invite:
    invite = next((i for i in invites.all() if i.id == invite_id), None)
    if invite is None:
        raise HTTPException(404, "Invite not found")
    if invite.status != "pending":
        raise HTTPException(409, f"This invite is already {invite.status}")
    _forbid(_can_give_role(caller, roles.resolve(invite.role)))
    invite.status = "revoked"
    invites.update(invite)
    await _log(caller, "invite.revoked", target_name=invite.email)
    return invite


@router.post("/invites/clear", response_model=list[Invite])
async def clear_invites(caller: Caller = Depends(require("team.invite"))) -> list[Invite]:
    """Remove invites that are finished (accepted, revoked or expired) and pending ones that aren't needed any
    more (the email is already on the team, or a super admin in the server settings). Returns what's left."""
    emails = {(h.email or "").lower() for h in await store.list_humans()}
    removed = invites.remove(lambda i: i.status != "pending" or i.email in emails or is_listed_super_admin(i.email))
    if removed:
        await _log(caller, "invite.cleared", target_name=f"{removed} invite{'s' if removed != 1 else ''}")
    return invites.all()


async def apply_invite(human: Human) -> bool:
    """At sign-up: give a pending invite's role to the person it was sent to. True if one was used."""
    invite = invites.pending_for(human.email)
    if invite is None:
        return False
    human.role, human.grants = invite.role, dict(invite.grants)
    invite.status, invite.accepted_by = "accepted", human.id
    invites.update(invite)
    audit.add(AuditEntry(actor_id=human.id, actor_name=human.name, action="invite.accepted", target_id=human.id,
                         target_name=human.name, detail=f"{roles.resolve(invite.role).label} (invited by {invite.invited_by})"))
    return True


# ---- super admin emails ----

async def _super_entries() -> list[SuperAdminEntry]:
    by_email = {(h.email or "").lower(): h for h in await store.list_humans()}
    added = {i.email: i for i in super_admin_emails.all()}
    entries = []
    for email in sorted(owner_emails()) + [e for e in added if e not in owner_emails()]:
        h, item = by_email.get(email), added.get(email)
        entries.append(SuperAdminEntry(email=email, owner=email in owner_emails(), added_by=item.added_by if item else "",
                                       added_at=item.added_at if item else None, human_id=h.id if h else None, name=h.name if h else ""))
    # Super admins made by role change (no email on the list) are shown too, so the list is complete
    for h in await store.list_humans():
        email = (h.email or "").lower()
        if h.role == SUPER_ADMIN and email not in owner_emails() and email not in added:
            entries.append(SuperAdminEntry(email=email or h.phone, owner=False, human_id=h.id, name=h.name))
    return entries


@router.get("/super-admins", response_model=list[SuperAdminEntry])
async def list_super_admins(_: Caller = Depends(require("team.view"))) -> list[SuperAdminEntry]:
    """Every super admin: the owners from the server settings, emails added from the app, and anyone with the role."""
    return await _super_entries()


@router.post("/super-admins", response_model=list[SuperAdminEntry])
async def add_super_admin(body: SuperAdminAdd, caller: Caller = Depends(require("admins.manage"))) -> list[SuperAdminEntry]:
    """Make an email a super admin straight away: their profile is upgraded now, or when they first sign in."""
    email = body.email.strip().lower()
    if is_owner(email):
        raise HTTPException(409, "This email is already the owner super admin")
    super_admin_emails.add(email, caller.name)
    for h in await store.list_humans():
        if (h.email or "").lower() == email and h.role != SUPER_ADMIN:
            h.role = SUPER_ADMIN
            await store.update_human(h, "role")
            await _changed(h.id)
    for i in invites.all():  # an open invite for them isn't needed any more
        if i.email == email and i.status == "pending":
            i.status = "revoked"
            invites.update(i)
    await _log(caller, "superadmin.added", target_name=email)
    return await _super_entries()


@router.delete("/super-admins/{email}", response_model=list[SuperAdminEntry])
async def remove_super_admin(email: str, caller: Caller = Depends(require("admins.manage"))) -> list[SuperAdminEntry]:
    """Take super admin away from an email added from the app (they become an Admin). Owners can't be removed."""
    email = email.strip().lower()
    if is_owner(email):
        raise HTTPException(403, "The owner's super admin access comes from the server settings and can't be removed here")
    human = next((h for h in await store.list_humans() if (h.email or "").lower() == email), None)
    if human and human.id == caller.human_id:
        raise HTTPException(403, "You can't remove yourself: ask another super admin")
    listed = super_admin_emails.remove(email)
    if human and human.role == SUPER_ADMIN:
        await _keep_a_super(human)
        human.role = "admin"
        await store.update_human(human, "role")
        await _changed(human.id)
    elif not listed:
        raise HTTPException(404, "That email isn't a super admin")
    await _log(caller, "superadmin.removed", human, detail="now Admin" if human else "", target_name=email)
    return await _super_entries()


# ---- audit ----

class AuditPage(ApiModel):
    entries: list[AuditEntry]
    generated_at: datetime = Field(default_factory=now)


@router.get("/audit", response_model=AuditPage)
async def audit_log(target_id: str | None = None, limit: int = 200, _: Caller = Depends(require("audit.view"))) -> AuditPage:
    return AuditPage(entries=audit.list(limit=min(limit, 1000), target_id=target_id))
