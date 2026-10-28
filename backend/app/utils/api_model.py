"""Shared base for API models: camelCase on the wire to match the React Native app."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

E164 = r"^\+\d{8,15}$"  # phone number with country code, e.g. +919876543210


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def to_wire(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True, mode="json")
