from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.features.auth.rbac import Caller, check_perm, require
from app.features.contacts.store import contacts
from app.features.schedule.models import ScheduledCall, ScheduleRequest, ScheduleStatus
from app.features.schedule.runner import publish, run_due
from app.features.schedule.store import schedule
from app.utils.api_model import new_id, now

router = APIRouter(prefix="/scheduled", tags=["scheduled"])


def _get(item_id: str) -> ScheduledCall:
    item = schedule.get(item_id)
    if item is None:
        raise HTTPException(404, "Scheduled call not found")
    return item


@router.get("", response_model=list[ScheduledCall], dependencies=[Depends(require("scheduling.view"))])
async def list_scheduled() -> list[ScheduledCall]:
    return schedule.all()


@router.post("", response_model=list[ScheduledCall])
async def schedule_calls(body: ScheduleRequest, caller: Caller = Depends(require("scheduling.create"))) -> list[ScheduledCall]:
    """Schedule one AI call (a callback) or a campaign: the AI calls each number in turn, `spacingS` apart."""
    try:
        numbers = body.checked_numbers()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if len(numbers) > 1:
        check_perm(caller, "scheduling.campaigns")
    blocked = [n for n in numbers if contacts.is_blocked(n)]
    numbers = [n for n in numbers if n not in blocked]
    if not numbers:
        raise HTTPException(403, "Every number is on your do-not-call list")
    start = max(body.run_at or now(), now())
    batch_id = new_id("bat") if len(numbers) > 1 else None
    items = [
        ScheduledCall(
            to=n,
            purpose=body.purpose.strip(),
            run_at=start + timedelta(seconds=i * body.spacing_s),
            batch_id=batch_id,
            batch_name=body.name.strip(),
        )
        for i, n in enumerate(numbers)
    ]
    schedule.add(items)
    for item in items:
        await publish(item)
    return items


@router.post("/{item_id}/cancel", response_model=ScheduledCall, dependencies=[Depends(require("scheduling.cancel"))])
async def cancel_scheduled(item_id: str) -> ScheduledCall:
    item = _get(item_id)
    if item.status != ScheduleStatus.SCHEDULED:
        raise HTTPException(409, f"This call is already {item.status.value}")
    item.status = ScheduleStatus.CANCELLED
    schedule.update(item)
    await publish(item)
    return item


@router.post("/batch/{batch_id}/cancel", response_model=list[ScheduledCall], dependencies=[Depends(require("scheduling.cancel"))])
async def cancel_batch(batch_id: str) -> list[ScheduledCall]:
    """Stop a campaign: every call of it that hasn't been placed yet is cancelled."""
    cancelled = []
    for item in schedule.all():
        if item.batch_id == batch_id and item.status == ScheduleStatus.SCHEDULED:
            item.status = ScheduleStatus.CANCELLED
            schedule.update(item)
            await publish(item)
            cancelled.append(item)
    return cancelled


@router.post("/{item_id}/run-now", response_model=ScheduledCall, dependencies=[Depends(require("scheduling.cancel"))])
async def run_scheduled_now(item_id: str) -> ScheduledCall:
    item = _get(item_id)
    if item.status not in (ScheduleStatus.SCHEDULED, ScheduleStatus.FAILED, ScheduleStatus.CANCELLED):
        raise HTTPException(409, f"This call is already {item.status.value}")
    item.status, item.run_at, item.error = ScheduleStatus.SCHEDULED, now(), ""
    schedule.update(item)
    await run_due()
    return _get(item_id)


@router.post("/clear-finished", dependencies=[Depends(require("scheduling.cancel"))])
async def clear_finished() -> dict:
    return {"removed": schedule.clear_finished()}
