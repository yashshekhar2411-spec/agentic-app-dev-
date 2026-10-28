"""Realtime event bus: pushes call / handoff events to every connected agent app over WebSocket.

With Redis, events go through a pub/sub channel so agents connected to any server process get every event.
Without it, events go straight to this process's sockets.
"""

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket
from redis.asyncio import Redis

log = logging.getLogger(__name__)

SEND_TIMEOUT_S = 5  # a stalled client is dropped instead of delaying everyone else
CHANNEL = "agentic:events"

 
class EventBus:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._redis: Redis | None = None
        self._relay: asyncio.Task | None = None

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)

    async def _send(self, ws: WebSocket, text: str) -> None:
        try:
            await asyncio.wait_for(ws.send_text(text), SEND_TIMEOUT_S)
        except Exception:  # client went away or stalled mid-send
            self.disconnect(ws)

    async def _deliver(self, text: str) -> None:
        if self._clients:
            await asyncio.gather(*(self._send(ws, text) for ws in list(self._clients)))

    async def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        # Encode once, not once per connected agent
        text = json.dumps({"type": event_type, **payload}, separators=(",", ":"))
        if self._redis is not None:
            try:
                await self._redis.publish(CHANNEL, text)  # comes back through _listen on every server
                return
            except Exception:
                log.exception("Redis publish failed; delivering to this server's agents only")
        await self._deliver(text)

    # ---- Redis relay ----

    async def start_relay(self, redis: Redis) -> None:
        self._redis = redis
        ready = asyncio.Event()
        self._relay = asyncio.create_task(self._listen(ready))
        await asyncio.wait_for(ready.wait(), 10)

    async def stop_relay(self) -> None:
        if self._relay is not None:
            self._relay.cancel()
            try:
                await self._relay
            except asyncio.CancelledError:
                pass
        self._relay, self._redis = None, None

    async def _listen(self, ready: asyncio.Event) -> None:
        assert self._redis is not None
        delay = 1.0
        while True:
            try:
                async with self._redis.pubsub(ignore_subscribe_messages=True) as pubsub:
                    await pubsub.subscribe(CHANNEL)
                    ready.set()
                    delay = 1.0
                    async for message in pubsub.listen():
                        if message["type"] == "message":
                            await self._deliver(message["data"])
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Redis event relay dropped; reconnecting in %.0fs", delay)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)


bus = EventBus()
