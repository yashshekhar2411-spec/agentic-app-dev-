"""ValueFirst delivery reports: how each campaign call went. They only close the call in the app."""

import logging

from fastapi import APIRouter, Request, Response

from app.features.agent.orchestrator import add_turn
from app.features.calls.models import Speaker
from app.features.handoff import service as handoff_service
from app.storage.store import store

log = logging.getLogger(__name__)

router = APIRouter(prefix="/valuefirst", tags=["valuefirst"])

_FAILED = {"failed", "busy", "noanswer", "no-answer", "no_answer", "rejected", "undelivered", "unanswered", "notanswered"}


@router.post("/dlr")
async def delivery_report(request: Request, call_id: str | None = None) -> Response:
    """ValueFirst's delivery report for a campaign call: logged, and the call closed once it's over."""
    try:
        report = await request.json()
    except ValueError:
        report = {k: str(v) for k, v in (await request.form()).items()}
    log.info("ValueFirst DLR for %s: %s", call_id, report)
    call = await store.get_call(call_id) if call_id else None
    if call is None or call.ended_at is not None:
        return Response(status_code=204)
    text = str(report).lower()
    status = next((s for s in _FAILED if s in text), None)
    await add_turn(call, Speaker.SYSTEM, f"Call not answered ({status})." if status else "Campaign call finished.")
    await handoff_service.end_call(call)
    return Response(status_code=204)
