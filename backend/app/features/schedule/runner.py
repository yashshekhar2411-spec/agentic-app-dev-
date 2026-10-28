"""Places scheduled AI calls when their time comes, one at a time."""

import asyncio
import logging

from app.config.settings import get_settings
from app.features.calls.outbound import OutboundError, place_outbound
from app.features.schedule.models import ScheduledCall, ScheduleStatus
from app.features.schedule.store import schedule
from app.services.realtime.bus import bus

log = logging.getLogger(__name__)


async def publish(item: ScheduledCall) -> None:
    await bus.publish("scheduled.updated", {"scheduled": item.to_wire()})


async def run_due() -> int:
    """Place every call whose time has come. Returns how many were tried."""
    tried = 0
    for item in schedule.due():
        current = schedule.get(item.id)
        if current is None or current.status != ScheduleStatus.SCHEDULED:  # cancelled meanwhile
            continue
        current.status = ScheduleStatus.PLACING
        schedule.update(current)
        await publish(current)
        try:
            call = await place_outbound(current.to, current.purpose)
            current.status, current.call_id, current.error = ScheduleStatus.PLACED, call.id, ""
        except OutboundError as exc:
            current.status, current.error = ScheduleStatus.FAILED, exc.detail
            log.info("scheduled call %s to %s failed: %s", current.id, current.to, exc.detail)
        except Exception as exc:  # never let one bad call stop the scheduler
            log.exception("scheduled call %s failed", current.id)
            current.status, current.error = ScheduleStatus.FAILED, str(exc) or type(exc).__name__
        schedule.update(current)
        await publish(current)
        tried += 1
    return tried


async def run_forever() -> None:
    while True:
        try:
            await run_due()
        except Exception:
            log.exception("scheduler failed")
        await asyncio.sleep(get_settings().schedule_poll_s)
