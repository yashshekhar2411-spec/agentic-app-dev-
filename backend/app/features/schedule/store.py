"""Scheduled AI calls (callbacks and campaigns), kept in backend/scheduled_calls.json so they survive a restart.

Only one server process should run the scheduler: with several, each would place the same due calls.
"""

import json
import logging
from datetime import timedelta
from pathlib import Path

from app.features.schedule.models import ScheduledCall, ScheduleStatus
from app.utils.api_model import now
from app.config.settings import DATA_DIR

log = logging.getLogger(__name__)

SAVED_FILE = DATA_DIR / "scheduled_calls.json"
KEEP_FINISHED_DAYS = 14  # finished entries older than this are dropped on save


class ScheduleBook:
    def __init__(self) -> None:
        self._items: dict[str, ScheduledCall] = {}
        self._file = SAVED_FILE

    def load(self, path: Path) -> None:
        self._items, self._file = {}, path
        if not path.exists():
            return
        try:
            for raw in json.loads(path.read_text(encoding="utf-8")):
                item = ScheduledCall(**raw)
                if item.status == ScheduleStatus.PLACING:  # the server stopped mid-dial: don't call twice
                    item.status, item.error = ScheduleStatus.FAILED, "The server restarted while placing this call"
                self._items[item.id] = item
            log.info("loaded %d scheduled calls from %s", len(self._items), path.name)
        except (OSError, ValueError) as exc:
            log.warning("ignoring %s: %s", path.name, exc)

    def _save(self) -> None:
        cutoff = now() - timedelta(days=KEEP_FINISHED_DAYS)
        self._items = {
            k: v for k, v in self._items.items() if v.status in (ScheduleStatus.SCHEDULED, ScheduleStatus.PLACING) or v.run_at > cutoff
        }
        try:
            self._file.write_text(json.dumps([i.to_wire() for i in self._items.values()], indent=2), encoding="utf-8")
        except OSError as exc:
            log.warning("couldn't save scheduled calls: %s", exc)

    def add(self, items: list[ScheduledCall]) -> None:
        for item in items:
            self._items[item.id] = item.model_copy()
        self._save()

    def get(self, item_id: str) -> ScheduledCall | None:
        item = self._items.get(item_id)
        return item.model_copy() if item else None

    def all(self) -> list[ScheduledCall]:
        return sorted((i.model_copy() for i in self._items.values()), key=lambda i: i.run_at)

    def update(self, item: ScheduledCall) -> None:
        if item.id in self._items:
            self._items[item.id] = item.model_copy()
            self._save()

    def due(self) -> list[ScheduledCall]:
        t = now()
        return [i for i in self.all() if i.status == ScheduleStatus.SCHEDULED and i.run_at <= t]

    def clear_finished(self) -> int:
        before = len(self._items)
        self._items = {k: v for k, v in self._items.items() if v.status in (ScheduleStatus.SCHEDULED, ScheduleStatus.PLACING)}
        self._save()
        return before - len(self._items)


schedule = ScheduleBook()
