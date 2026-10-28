"""Connects storage at startup: Postgres (DATABASE_URL) and Redis (REDIS_URL), or in-memory fallbacks."""

import logging
from pathlib import Path

from redis.asyncio import Redis

from app.config.settings import DATA_DIR, Settings
from app.services.realtime.bus import bus
from app.storage.conversations import MemoryConversations, RedisConversations, conversations
from app.storage.store import MemoryStore, store

log = logging.getLogger(__name__)

_redis: Redis | None = None


async def open_state(s: Settings) -> None:
    global _redis
    if s.database_url:
        from app.storage.postgres import PostgresStore

        store.use(await PostgresStore.connect(s.database_url, max_size=s.db_pool_max))
        log.info("storage: PostgreSQL")
    else:
        humans_file = None
        if s.humans_file:
            humans_file = Path(s.humans_file)
            humans_file = humans_file if humans_file.is_absolute() else DATA_DIR / humans_file
        store.use(MemoryStore(max_finished_calls=s.max_finished_calls, humans_file=humans_file))
        log.warning("DATABASE_URL is not set: calls are kept in memory and lost on restart%s",
                    f" (team members and roles are saved in {humans_file.name})" if humans_file else "")

    if s.redis_url:
        _redis = Redis.from_url(s.redis_url, decode_responses=True, socket_connect_timeout=5, health_check_interval=30)
        await _redis.ping()
        conversations.use(RedisConversations(_redis, ttl_s=s.conversation_ttl_s))
        await bus.start_relay(_redis)
        log.info("live state + events: Redis")
    else:
        conversations.use(MemoryConversations())
        if s.database_url:
            log.warning("REDIS_URL is not set: run a single server process (live AI state and events are in memory)")


async def close_state() -> None:
    global _redis
    await bus.stop_relay()
    if _redis is not None:
        await _redis.aclose()
        _redis = None
    await store.close()
