from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.config.settings import get_settings
from app.services.realtime.bus import bus
from app.features.auth.rbac import caller_access
from app.features.auth.security import websocket_principal
from app.storage.store import store

router = APIRouter(tags=["realtime"])


@router.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    principal = await websocket_principal(ws)
    if principal is None:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    # Live events carry calls and handoffs: only for people who may see one or the other
    caller = await caller_access(principal)
    if not (caller.can("calls.view") or caller.can("handoffs.view")):
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await bus.connect(ws)
    try:
        limit = get_settings().history_limit
        await ws.send_json(
            {
                "type": "snapshot",
                "calls": [c.to_wire() for c in await store.list_calls(limit=limit)],
                "handoffs": [h.to_wire() for h in await store.list_handoffs(limit=limit)],
            }
        )
        while True:
            if await ws.receive_text() == "ping":  # the app's keep-alive
                await ws.send_text("pong")  # lets the app tell a live connection from a dead one
    except WebSocketDisconnect:
        pass
    finally:
        bus.disconnect(ws)
