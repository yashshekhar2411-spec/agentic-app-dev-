import logging

from fastapi import APIRouter, Response, status

from app.config.settings import get_settings
from app.services.realtime.bus import bus
from app.storage.conversations import conversations
from app.storage.store import store

log = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(response: Response) -> dict:
    ok = True
    try:
        await store.ping()
    except Exception:  # load balancers should stop sending calls to a server that lost its database
        log.exception("health: database unreachable")
        ok = False
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "ok": ok,
        "agent": "claude" if get_settings().anthropic_api_key else "demo",
        "storage": store.kind,
        "liveState": conversations.kind,
        "realtimeClients": bus.client_count,
    }
