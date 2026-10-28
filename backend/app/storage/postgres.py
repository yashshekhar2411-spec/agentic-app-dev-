"""PostgreSQL backend for the store (used when DATABASE_URL is set). Same interface as MemoryStore.

The tables are created on first start. Transcript turns live in their own append-only table, so a turn
being added never overwrites a status change made by another request (or another server) at the same time.
"""

import json
import logging
from datetime import datetime
from enum import Enum
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import asyncpg

from app.features.calls.models import Call, CallStatus, Turn
from app.features.handoff.models import Handoff, HandoffStatus
from app.features.profile.models import Human, HumanStatus
from app.storage.store import StoreConflict

log = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS humans (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    phone       text NOT NULL UNIQUE,
    status      text NOT NULL,
    push_token  text,
    uid         text UNIQUE,
    email       text
);

ALTER TABLE humans ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE humans ADD COLUMN IF NOT EXISTS grants text NOT NULL DEFAULT '{}';
ALTER TABLE humans ADD COLUMN IF NOT EXISTS account_state text NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS calls (
    id               text PRIMARY KEY,
    from_number      text NOT NULL,
    twilio_call_sid  text UNIQUE,
    status           text NOT NULL,
    started_at       timestamptz NOT NULL,
    ended_at         timestamptz,
    handoff_id       text,
    voicemail_url    text
);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'inbound';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT '';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS disposition text;
CREATE INDEX IF NOT EXISTS calls_started_at_idx ON calls (started_at DESC);
CREATE INDEX IF NOT EXISTS calls_status_idx ON calls (status, started_at DESC);

CREATE TABLE IF NOT EXISTS call_turns (
    id       bigserial PRIMARY KEY,
    call_id  text NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
    speaker  text NOT NULL,
    text     text NOT NULL,
    at       timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS call_turns_call_idx ON call_turns (call_id, id);

CREATE TABLE IF NOT EXISTS handoffs (
    id           text PRIMARY KEY,
    call_id      text NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
    reason       text NOT NULL,
    detail       text NOT NULL DEFAULT '',
    summary      text NOT NULL DEFAULT '',
    urgency      text NOT NULL DEFAULT 'normal',
    status       text NOT NULL,
    assigned_to  text REFERENCES humans (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL,
    accepted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS handoffs_created_at_idx ON handoffs (created_at DESC);
CREATE INDEX IF NOT EXISTS handoffs_status_idx ON handoffs (status, created_at DESC);
"""

# Columns update_* may write: field names come from code, but never build SQL from anything else
_CALL_FIELDS = {"from_number", "twilio_call_sid", "status", "ended_at", "handoff_id", "voicemail_url", "notes", "tags", "disposition"}
_HANDOFF_FIELDS = {"detail", "summary", "urgency", "status", "assigned_to", "accepted_at"}
_HUMAN_FIELDS = {"name", "phone", "status", "push_token", "uid", "email", "role", "grants", "account_state"}


def _db(value: Any) -> Any:
    if isinstance(value, dict):  # grants: kept as JSON text
        return json.dumps({k: (v.model_dump(mode="json") if hasattr(v, "model_dump") else _db(v)) for k, v in value.items()})
    return value.value if isinstance(value, Enum) else value


def _human_from_row(row: asyncpg.Record) -> Human:
    data = dict(row)
    data.pop("module_overrides", None)  # from the first version of roles; replaced by grants
    data["grants"] = json.loads(data.get("grants") or "{}")
    return Human(**data)


async def _create_database_if_missing(dsn: str) -> None:
    parts = urlsplit(dsn)
    name = parts.path.lstrip("/")
    if not name:
        return
    admin = await asyncpg.connect(urlunsplit(parts._replace(path="/postgres")))
    try:
        if not await admin.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", name):
            await admin.execute(f'CREATE DATABASE "{name.replace(chr(34), "")}"')
            log.info("created database %s", name)
    finally:
        await admin.close()


class PostgresStore:
    kind = "postgres"

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    @classmethod
    async def connect(cls, dsn: str, max_size: int = 10) -> "PostgresStore":
        try:
            pool = await asyncpg.create_pool(dsn, min_size=1, max_size=max_size, command_timeout=10)
        except asyncpg.InvalidCatalogNameError:
            await _create_database_if_missing(dsn)
            pool = await asyncpg.create_pool(dsn, min_size=1, max_size=max_size, command_timeout=10)
        async with pool.acquire() as conn:
            # Several servers may start at once: only one creates the tables
            async with conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock(727274)")
                await conn.execute(SCHEMA)
        return cls(pool)

    async def ping(self) -> None:
        await self.pool.fetchval("SELECT 1")

    async def close(self) -> None:
        await self.pool.close()

    async def reset(self) -> None:
        """Delete everything (tests only)."""
        await self.pool.execute("TRUNCATE call_turns, handoffs, calls, humans")

    async def _update(self, table: str, allowed: set[str], item: Any, fields: tuple[str, ...]) -> None:
        if not fields:
            return
        unknown = set(fields) - allowed
        if unknown:
            raise ValueError(f"{table}: cannot update {unknown}")
        sets = ", ".join(f"{name} = ${i}" for i, name in enumerate(fields, start=2))
        try:
            await self.pool.execute(
                f"UPDATE {table} SET {sets} WHERE id = $1", item.id, *(_db(getattr(item, f)) for f in fields)
            )
        except asyncpg.UniqueViolationError as exc:
            raise StoreConflict(str(exc)) from exc

    # ---- calls ----

    async def add_call(self, call: Call) -> Call:
        try:
            async with self.pool.acquire() as conn, conn.transaction():
                await conn.execute(
                    """INSERT INTO calls (id, from_number, twilio_call_sid, status, started_at, ended_at, handoff_id, voicemail_url,
                                          direction, purpose, notes, tags, disposition)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)""",
                    call.id, call.from_number, call.twilio_call_sid, call.status.value,
                    call.started_at, call.ended_at, call.handoff_id, call.voicemail_url,
                    call.direction.value, call.purpose, call.notes, call.tags, _db(call.disposition),
                )
                if call.transcript:
                    await conn.executemany(
                        "INSERT INTO call_turns (call_id, speaker, text, at) VALUES ($1, $2, $3, $4)",
                        [(call.id, t.speaker.value, t.text, t.at) for t in call.transcript],
                    )
        except asyncpg.UniqueViolationError as exc:
            raise StoreConflict(f"Call {call.twilio_call_sid} already exists") from exc
        return call

    async def _with_transcripts(self, rows: list[asyncpg.Record]) -> list[Call]:
        if not rows:
            return []
        calls = {r["id"]: Call(**dict(r)) for r in rows}
        turns = await self.pool.fetch(
            "SELECT call_id, speaker, text, at FROM call_turns WHERE call_id = ANY($1::text[]) ORDER BY id",
            list(calls),
        )
        for t in turns:
            calls[t["call_id"]].transcript.append(Turn(speaker=t["speaker"], text=t["text"], at=t["at"]))
        return list(calls.values())

    async def get_call(self, call_id: str) -> Call | None:
        rows = await self.pool.fetch("SELECT * FROM calls WHERE id = $1", call_id)
        calls = await self._with_transcripts(rows)
        return calls[0] if calls else None

    async def call_by_sid(self, sid: str) -> Call | None:
        rows = await self.pool.fetch("SELECT * FROM calls WHERE twilio_call_sid = $1", sid)
        calls = await self._with_transcripts(rows)
        return calls[0] if calls else None

    async def list_calls(self, status: CallStatus | None = None, limit: int = 200) -> list[Call]:
        if status is None:
            rows = await self.pool.fetch("SELECT * FROM calls ORDER BY started_at DESC LIMIT $1", limit)
        else:
            rows = await self.pool.fetch(
                "SELECT * FROM calls WHERE status = $1 ORDER BY started_at DESC LIMIT $2", status.value, limit
            )
        return await self._with_transcripts(rows)

    async def update_call(self, call: Call, *fields: str) -> None:
        await self._update("calls", _CALL_FIELDS, call, fields)

    async def add_turn(self, call_id: str, turn: Turn) -> None:
        await self.pool.execute(
            "INSERT INTO call_turns (call_id, speaker, text, at) VALUES ($1, $2, $3, $4)",
            call_id, turn.speaker.value, turn.text, turn.at,
        )

    async def call_finished(self, call: Call) -> None:
        return None  # history is kept in the database

    # ---- handoffs ----

    async def add_handoff(self, handoff: Handoff) -> Handoff:
        await self.pool.execute(
            """INSERT INTO handoffs (id, call_id, reason, detail, summary, urgency, status, assigned_to, created_at, accepted_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
            handoff.id, handoff.call_id, handoff.reason.value, handoff.detail, handoff.summary, handoff.urgency,
            handoff.status.value, handoff.assigned_to, handoff.created_at, handoff.accepted_at,
        )
        return handoff

    async def get_handoff(self, handoff_id: str) -> Handoff | None:
        row = await self.pool.fetchrow("SELECT * FROM handoffs WHERE id = $1", handoff_id)
        return Handoff(**dict(row)) if row else None

    async def list_handoffs(self, status: HandoffStatus | None = None, limit: int = 200) -> list[Handoff]:
        if status is None:
            rows = await self.pool.fetch("SELECT * FROM handoffs ORDER BY created_at DESC LIMIT $1", limit)
        else:
            rows = await self.pool.fetch(
                "SELECT * FROM handoffs WHERE status = $1 ORDER BY created_at DESC LIMIT $2", status.value, limit
            )
        return [Handoff(**dict(r)) for r in rows]

    async def update_handoff(self, handoff: Handoff, *fields: str) -> None:
        await self._update("handoffs", _HANDOFF_FIELDS, handoff, fields)

    async def claim_handoff(self, handoff_id: str, human_id: str, at: datetime) -> bool:
        # One atomic statement: if two agents (on any server) tap "Take call" together, exactly one wins
        result = await self.pool.execute(
            "UPDATE handoffs SET status = $2, assigned_to = $3, accepted_at = $4 WHERE id = $1 AND status = $5",
            handoff_id, HandoffStatus.ACCEPTED.value, human_id, at, HandoffStatus.PENDING.value,
        )
        return result == "UPDATE 1"

    async def expire_handoff(self, handoff_id: str) -> bool:
        result = await self.pool.execute(
            "UPDATE handoffs SET status = $2 WHERE id = $1 AND status = $3",
            handoff_id, HandoffStatus.EXPIRED.value, HandoffStatus.PENDING.value,
        )
        return result == "UPDATE 1"

    # ---- humans ----

    async def save_human(self, human: Human) -> Human:
        try:
            await self.pool.execute(
                """INSERT INTO humans (id, name, phone, status, push_token, uid, email, role, grants, account_state)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                   ON CONFLICT (id) DO UPDATE SET name = $2, phone = $3, status = $4, push_token = $5, uid = $6, email = $7,
                                                  role = $8, grants = $9, account_state = $10""",
                human.id, human.name, human.phone, human.status.value, human.push_token, human.uid, human.email,
                human.role, _db(human.grants), human.account_state,
            )
        except asyncpg.UniqueViolationError as exc:
            raise StoreConflict("This phone number or account already belongs to another agent") from exc
        return human

    async def _human(self, column: str, value: str) -> Human | None:
        row = await self.pool.fetchrow(f"SELECT * FROM humans WHERE {column} = $1", value)
        return _human_from_row(row) if row else None

    async def get_human(self, human_id: str) -> Human | None:
        return await self._human("id", human_id)

    async def human_by_phone(self, phone: str) -> Human | None:
        return await self._human("phone", phone)

    async def human_by_uid(self, uid: str) -> Human | None:
        return await self._human("uid", uid)

    async def list_humans(self) -> list[Human]:
        return [_human_from_row(r) for r in await self.pool.fetch("SELECT * FROM humans ORDER BY name")]

    async def online_humans(self) -> list[Human]:
        rows = await self.pool.fetch("SELECT * FROM humans WHERE status = $1", HumanStatus.ONLINE.value)
        return [_human_from_row(r) for r in rows]

    async def update_human(self, human: Human, *fields: str) -> None:
        await self._update("humans", _HUMAN_FIELDS, human, fields)
