"""Per-call AI state (Claude message history + policy counters) and the one-turn-at-a-time lock.

In Redis when REDIS_URL is set, so any server process can take the next caller turn; in memory otherwise.
The state is short-lived: it's dropped when the call ends, and Redis expires it after CONVERSATION_TTL_S.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from redis.asyncio import Redis
from redis.exceptions import LockError

from app.storage.store import ConversationState, _Active


class TurnBusy(Exception):
    """Another caller turn for the same call is still running and didn't finish in time."""


class MemoryConversations:
    kind = "memory"

    def __init__(self) -> None:
        self._states: dict[str, str] = {}  # JSON, like Redis, so non-serialisable history fails in tests too
        self._locks: dict[str, asyncio.Lock] = {}

    async def get(self, call_id: str) -> ConversationState:
        raw = self._states.get(call_id)
        return ConversationState.loads(raw) if raw else ConversationState()

    async def save(self, call_id: str, state: ConversationState) -> None:
        self._states[call_id] = state.dumps()

    async def drop(self, call_id: str) -> None:
        self._states.pop(call_id, None)
        self._locks.pop(call_id, None)

    @asynccontextmanager
    async def turn(self, call_id: str, wait_s: float) -> AsyncIterator[None]:
        lock = self._locks.setdefault(call_id, asyncio.Lock())
        try:
            await asyncio.wait_for(lock.acquire(), wait_s)
        except TimeoutError as exc:
            raise TurnBusy(call_id) from exc
        try:
            yield
        finally:
            lock.release()


class RedisConversations:
    kind = "redis"

    def __init__(self, redis: Redis, ttl_s: int) -> None:
        self.redis = redis
        self.ttl_s = ttl_s

    @staticmethod
    def _key(call_id: str) -> str:
        return f"agentic:conversation:{call_id}"

    async def get(self, call_id: str) -> ConversationState:
        raw = await self.redis.get(self._key(call_id))
        return ConversationState.loads(raw) if raw else ConversationState()

    async def save(self, call_id: str, state: ConversationState) -> None:
        await self.redis.set(self._key(call_id), state.dumps(), ex=self.ttl_s)

    async def drop(self, call_id: str) -> None:
        await self.redis.delete(self._key(call_id))

    @asynccontextmanager
    async def turn(self, call_id: str, wait_s: float) -> AsyncIterator[None]:
        # A lock every server sees. It expires on its own, so a crashed server can't block the call forever.
        lock = self.redis.lock(f"agentic:turn-lock:{call_id}", timeout=wait_s * 2, blocking_timeout=wait_s)
        if not await lock.acquire():
            raise TurnBusy(call_id)
        try:
            yield
        finally:
            try:
                await lock.release()
            except LockError:
                pass  # expired while the turn ran; nothing to release


conversations: MemoryConversations = _Active(MemoryConversations())  # type: ignore[assignment]
