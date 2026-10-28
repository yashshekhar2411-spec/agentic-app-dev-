from fastapi import APIRouter, Depends, HTTPException

from app.features.auth.rbac import require
from app.config.settings import get_settings
from app.features.profile.router import own_human
from app.features.auth.security import Principal, current_principal
from app.storage.store import store
from app.features.handoff import service as handoff_service
from app.features.handoff.models import AcceptHandoffRequest, Handoff, HandoffStatus

router = APIRouter(prefix="/handoffs", tags=["handoffs"])


@router.get("", response_model=list[Handoff], dependencies=[Depends(require("handoffs.view"))])
async def list_handoffs(status: HandoffStatus | None = None) -> list[Handoff]:
    return await store.list_handoffs(status, limit=get_settings().history_limit)


@router.post("/{handoff_id}/accept", response_model=Handoff, dependencies=[Depends(require("handoffs.take"))])
async def accept_handoff(
    handoff_id: str, body: AcceptHandoffRequest, principal: Principal = Depends(current_principal)
) -> Handoff:
    await own_human(body.human_id, principal)  # you can only take a call as yourself
    try:
        return await handoff_service.accept_handoff(handoff_id, body.human_id)
    except handoff_service.HandoffError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
