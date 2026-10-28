import re
from datetime import datetime
from enum import Enum

from pydantic import Field

from app.utils.api_model import E164, ApiModel, new_id, now


class ScheduleStatus(str, Enum):
    SCHEDULED = "scheduled"  # waiting for its time
    PLACING = "placing"  # being dialled right now
    PLACED = "placed"  # the call started: see call_id
    FAILED = "failed"  # couldn't be placed: see error
    CANCELLED = "cancelled"


class ScheduledCall(ApiModel):
    id: str = Field(default_factory=lambda: new_id("sch"))
    to: str
    purpose: str = ""
    run_at: datetime
    status: ScheduleStatus = ScheduleStatus.SCHEDULED
    call_id: str | None = None
    error: str = ""
    batch_id: str | None = None  # set on every call of a bulk campaign
    batch_name: str = ""
    created_at: datetime = Field(default_factory=now)


class ScheduleRequest(ApiModel):
    """One number is a callback; several are a campaign the AI works through one call at a time."""

    numbers: list[str] = Field(min_length=1, max_length=200)
    purpose: str = Field(default="", max_length=500)
    run_at: datetime | None = None  # first call; now if left out
    spacing_s: int = Field(default=60, ge=0, le=3600)  # wait between the calls of a campaign
    name: str = Field(default="", max_length=80)  # campaign name shown in the app

    def checked_numbers(self) -> list[str]:
        """The numbers, de-duplicated in order. Raises ValueError on one that isn't E.164."""
        seen: list[str] = []
        for raw in self.numbers:
            n = raw.strip().replace(" ", "")
            if not re.match(E164, n):
                raise ValueError(f"{raw!r} isn't a full number with its country code (e.g. +919876543210)")
            if n not in seen:
                seen.append(n)
        return seen
