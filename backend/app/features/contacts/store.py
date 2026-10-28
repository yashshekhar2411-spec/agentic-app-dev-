"""The team's address book: names for numbers, favourites and the do-not-call list.

Kept in backend/contacts.json (small, rarely written). With several server processes each one reads the file
only at start, like agent_settings.json: edit contacts on a single-process server.
"""

import json
import logging
from pathlib import Path

from app.features.contacts.models import Contact
from app.config.settings import DATA_DIR

log = logging.getLogger(__name__)

SAVED_FILE = DATA_DIR / "contacts.json"


class ContactBook:
    def __init__(self) -> None:
        self._by_number: dict[str, Contact] = {}
        self._file = SAVED_FILE

    def load(self, path: Path) -> None:
        """At startup: read the saved contacts (and save to the same file from now on)."""
        self._by_number, self._file = {}, path
        if not path.exists():
            return
        try:
            for raw in json.loads(path.read_text(encoding="utf-8")):
                c = Contact(**raw)
                self._by_number[c.number] = c
            log.info("loaded %d contacts from %s", len(self._by_number), path.name)
        except (OSError, ValueError) as exc:
            log.warning("ignoring %s: %s", path.name, exc)

    def _save(self) -> None:
        try:
            self._file.write_text(json.dumps([c.to_wire() for c in self._by_number.values()], indent=2), encoding="utf-8")
        except OSError as exc:
            log.warning("couldn't save contacts: %s", exc)  # still kept until restart

    def all(self) -> list[Contact]:
        # Favourites first, then by name (unnamed numbers last)
        return sorted(
            (c.model_copy() for c in self._by_number.values()),
            key=lambda c: (not c.favorite, not c.name, c.name.lower(), c.number),
        )

    def get(self, number: str) -> Contact | None:
        c = self._by_number.get(number)
        return c.model_copy() if c else None

    def put(self, contact: Contact) -> Contact:
        self._by_number[contact.number] = contact.model_copy()
        self._save()
        return contact

    def delete(self, number: str) -> bool:
        if self._by_number.pop(number, None) is None:
            return False
        self._save()
        return True

    def is_blocked(self, number: str) -> bool:
        c = self._by_number.get(number)
        return bool(c and c.blocked)


contacts = ContactBook()
