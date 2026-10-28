"""The audit log of access changes and the pending invites, kept in backend/rbac_audit.json and
backend/invites.json (small, single-process files like roles.json)."""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

from pydantic import Field

from app.config.settings import DATA_DIR
from app.features.auth.rbac import Grant
from app.utils.api_model import ApiModel, new_id, now

log = logging.getLogger(__name__)

AUDIT_FILE = DATA_DIR / "rbac_audit.json"
INVITES_FILE = DATA_DIR / "invites.json"
AUDIT_KEEP = 2000  # newest entries kept
INVITE_DAYS = 7


class AuditEntry(ApiModel):
    id: str = Field(default_factory=lambda: new_id("aud"))
    at: datetime = Field(default_factory=now)
    actor_id: str | None = None
    actor_name: str
    action: str  # e.g. "role.changed", "access.allowed", "member.suspended", "invite.created"
    target_id: str | None = None
    target_name: str = ""
    detail: str = ""


class Invite(ApiModel):
    id: str = Field(default_factory=lambda: new_id("inv"))
    email: str
    role: str
    grants: dict[str, Grant] = Field(default_factory=dict)
    invited_by: str
    created_at: datetime = Field(default_factory=now)
    expires_at: datetime = Field(default_factory=lambda: now() + timedelta(days=INVITE_DAYS))
    status: Literal["pending", "accepted", "revoked", "expired"] = "pending"
    accepted_by: str | None = None  # human id


class _JsonList:
    def __init__(self, path: Path) -> None:
        self._file = path

    def _read(self) -> list[dict]:
        if not self._file.exists():
            return []
        try:
            return json.loads(self._file.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            log.warning("ignoring %s: %s", self._file.name, exc)
            return []

    def _write(self, items: list[dict]) -> None:
        try:
            self._file.write_text(json.dumps(items, indent=1), encoding="utf-8")
        except OSError as exc:
            log.warning("couldn't save %s: %s", self._file.name, exc)


class AuditLog(_JsonList):
    def load(self, path: Path) -> None:
        self._file = path

    def add(self, entry: AuditEntry) -> AuditEntry:
        items = [entry.to_wire()] + self._read()
        self._write(items[:AUDIT_KEEP])
        log.info("audit: %s %s %s %s", entry.actor_name, entry.action, entry.target_name, entry.detail)
        return entry

    def list(self, limit: int = 200, target_id: str | None = None) -> list[AuditEntry]:
        entries = [AuditEntry(**raw) for raw in self._read()]
        if target_id:
            entries = [e for e in entries if e.target_id == target_id or e.actor_id == target_id]
        return entries[:limit]


class Invites(_JsonList):
    def load(self, path: Path) -> None:
        self._file = path

    def all(self) -> list[Invite]:
        t = now()
        invites = [Invite(**raw) for raw in self._read()]
        for i in invites:
            if i.status == "pending" and i.expires_at <= t:
                i.status = "expired"
        return sorted(invites, key=lambda i: i.created_at, reverse=True)

    def _save_all(self, invites: list[Invite]) -> None:
        self._write([i.to_wire() for i in invites])

    def add(self, invite: Invite) -> Invite:
        invites = [i for i in self.all() if not (i.email == invite.email and i.status == "pending")]  # newest wins
        self._save_all([invite] + invites)
        return invite

    def update(self, invite: Invite) -> None:
        self._save_all([invite if i.id == invite.id else i for i in self.all()])

    def remove(self, finished) -> int:
        """Drop every invite `finished(invite)` is true for; returns how many went."""
        current = self.all()
        keep = [i for i in current if not finished(i)]
        self._save_all(keep)
        return len(current) - len(keep)

    def pending_for(self, email: str | None) -> Invite | None:
        if not email:
            return None
        return next((i for i in self.all() if i.status == "pending" and i.email == email.lower()), None)


audit = AuditLog(AUDIT_FILE)
invites = Invites(INVITES_FILE)
