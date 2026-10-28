"""Storage for calls, handoffs and humans.

Two backends with the same async interface:
- PostgresStore (app/storage/postgres.py) when DATABASE_URL is set: durable, safe with many server processes;
- MemoryStore (below) otherwise: single process, lost on restart (dev and tests).

Reads return copies, in both backends. Changing a returned object does nothing until it is saved
with the matching update_* method, so code that works in memory mode also works on Postgres.
"""

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from app.features.calls.models import Call, CallStatus, Turn
from app.features.handoff.models import Handoff, HandoffStatus
from app.features.profile.models import Human, HumanStatus

FINISHED = (CallStatus.ENDED, CallStatus.VOICEMAIL)

log = logging.getLogger(__name__)


class StoreConflict(Exception):
    """A unique value (e.g. a phone number) already belongs to another record."""


@dataclass
class ConversationState:
    """What the agent needs between caller turns. Not sent to the app. Kept in app/storage/conversations.py."""

    messages: list[dict[str, Any]] = field(default_factory=list)  # Claude message history (JSON only)
    ai_turns: int = 0
    failed_turns: int = 0  # consecutive empty / unrecognised caller turns
    tool_failures: int = 0

    def dumps(self) -> str:
        return json.dumps(asdict(self), separators=(",", ":"))

    @classmethod
    def loads(cls, raw: str) -> "ConversationState":
        return cls(**json.loads(raw))


def _copy(item: Any) -> Any:
    return item.model_copy(deep=True)


def _newest_first(items: list[Any], key: str, limit: int) -> list[Any]:
    return sorted(items, key=lambda i: getattr(i, key), reverse=True)[:limit]


class MemoryStore:
    kind = "memory"

    def __init__(self, max_finished_calls: int = 500, humans_file: Path | None = None) -> None:
        self.max_finished_calls = max_finished_calls
        self._calls: dict[str, Call] = {}
        self._handoffs: dict[str, Handoff] = {}
        self._humans: dict[str, Human] = {}
        self._call_ids_by_sid: dict[str, str] = {}
        # Team members and their roles survive a restart (calls don't): a small JSON file, single process only
        self._humans_file = humans_file
        if humans_file and humans_file.exists():
            try:
                for raw in json.loads(humans_file.read_text(encoding="utf-8")):
                    h = Human(**raw)
                    self._humans[h.id] = h
                log.info("loaded %d team members from %s", len(self._humans), humans_file.name)
            except (OSError, ValueError, TypeError) as exc:
                log.warning("ignoring %s: %s", humans_file.name, exc)

    def _save_humans(self) -> None:
        if not self._humans_file:
            return
        try:
            self._humans_file.write_text(json.dumps([h.to_wire() for h in self._humans.values()], indent=1), encoding="utf-8")
        except OSError as exc:
            log.warning("couldn't save team members: %s", exc)

    async def ping(self) -> None:
        return None

    async def close(self) -> None:
        return None

    # ---- calls ----

    async def add_call(self, call: Call) -> Call:
        if call.twilio_call_sid and call.twilio_call_sid in self._call_ids_by_sid:
            raise StoreConflict(f"Call {call.twilio_call_sid} already exists")
        self._calls[call.id] = _copy(call)
        if call.twilio_call_sid:
            self._call_ids_by_sid[call.twilio_call_sid] = call.id
        return call

    async def get_call(self, call_id: str) -> Call | None:
        call = self._calls.get(call_id)
        return _copy(call) if call else None

    async def call_by_sid(self, sid: str) -> Call | None:
        call_id = self._call_ids_by_sid.get(sid)
        return await self.get_call(call_id) if call_id else None

    async def list_calls(self, status: CallStatus | None = None, limit: int = 200) -> list[Call]:
        calls = [c for c in self._calls.values() if status is None or c.status == status]
        return [_copy(c) for c in _newest_first(calls, "started_at", limit)]

    async def update_call(self, call: Call, *fields: str) -> None:
        stored = self._calls.get(call.id)
        if stored:
            if "twilio_call_sid" in fields and call.twilio_call_sid:
                if self._call_ids_by_sid.get(call.twilio_call_sid, call.id) != call.id:
                    raise StoreConflict(f"Call {call.twilio_call_sid} already exists")
                self._call_ids_by_sid[call.twilio_call_sid] = call.id
            for name in fields:
                setattr(stored, name, getattr(call, name))

    async def add_turn(self, call_id: str, turn: Turn) -> None:
        if stored := self._calls.get(call_id):
            stored.transcript.append(turn.model_copy())

    async def call_finished(self, call: Call) -> None:
        """Drop the oldest finished calls beyond max_finished_calls (memory has no disk to spill to)."""
        finished = [c for c in self._calls.values() if c.status in FINISHED]
        if len(finished) <= self.max_finished_calls:
            return
        finished.sort(key=lambda c: c.ended_at or c.started_at)
        for old in finished[: len(finished) - self.max_finished_calls]:
            self._calls.pop(old.id, None)
            if old.handoff_id:
                self._handoffs.pop(old.handoff_id, None)
            if old.twilio_call_sid:
                self._call_ids_by_sid.pop(old.twilio_call_sid, None)

    # ---- handoffs ----

    async def add_handoff(self, handoff: Handoff) -> Handoff:
        self._handoffs[handoff.id] = _copy(handoff)
        return handoff

    async def get_handoff(self, handoff_id: str) -> Handoff | None:
        handoff = self._handoffs.get(handoff_id)
        return _copy(handoff) if handoff else None

    async def list_handoffs(self, status: HandoffStatus | None = None, limit: int = 200) -> list[Handoff]:
        handoffs = [h for h in self._handoffs.values() if status is None or h.status == status]
        return [_copy(h) for h in _newest_first(handoffs, "created_at", limit)]

    async def update_handoff(self, handoff: Handoff, *fields: str) -> None:
        stored = self._handoffs.get(handoff.id)
        if stored:
            for name in fields:
                setattr(stored, name, getattr(handoff, name))

    async def claim_handoff(self, handoff_id: str, human_id: str, at: datetime) -> bool:
        """Mark a pending handoff accepted by `human_id`. False if someone else got there first."""
        stored = self._handoffs.get(handoff_id)
        if stored is None or stored.status != HandoffStatus.PENDING:
            return False
        stored.status, stored.assigned_to, stored.accepted_at = HandoffStatus.ACCEPTED, human_id, at
        return True

    async def expire_handoff(self, handoff_id: str) -> bool:
        """Mark a still-pending handoff expired (caller left). False if it was accepted meanwhile."""
        stored = self._handoffs.get(handoff_id)
        if stored is None or stored.status != HandoffStatus.PENDING:
            return False
        stored.status = HandoffStatus.EXPIRED
        return True

    # ---- humans ----

    async def save_human(self, human: Human) -> Human:
        """Insert or update a human (all fields)."""
        for other in self._humans.values():
            if other.id != human.id and (other.phone == human.phone or (human.uid and other.uid == human.uid)):
                raise StoreConflict("This phone number or account already belongs to another agent")
        self._humans[human.id] = _copy(human)
        self._save_humans()
        return human

    async def get_human(self, human_id: str) -> Human | None:
        human = self._humans.get(human_id)
        return _copy(human) if human else None

    async def human_by_phone(self, phone: str) -> Human | None:
        return next((_copy(h) for h in self._humans.values() if h.phone == phone), None)

    async def human_by_uid(self, uid: str) -> Human | None:
        return next((_copy(h) for h in self._humans.values() if h.uid == uid), None)

    async def list_humans(self) -> list[Human]:
        return [_copy(h) for h in self._humans.values()]

    async def online_humans(self) -> list[Human]:
        return [_copy(h) for h in self._humans.values() if h.status == HumanStatus.ONLINE]

    async def update_human(self, human: Human, *fields: str) -> None:
        stored = self._humans.get(human.id)
        if stored:
            for name in fields:
                setattr(stored, name, getattr(human, name))
            if fields != ("status",):  # online / offline changes all the time and needn't survive a restart
                self._save_humans()


class _Active:
    """The backend chosen at startup (app/storage/lifecycle.py). Modules import this once and keep it."""

    def __init__(self, impl: Any) -> None:
        self._impl = impl

    def use(self, impl: Any) -> None:
        self._impl = impl

    @property
    def impl(self) -> Any:
        return self._impl

    def __getattr__(self, name: str) -> Any:
        return getattr(self._impl, name)


store: MemoryStore = _Active(MemoryStore())  # type: ignore[assignment]  # same interface as the backends
