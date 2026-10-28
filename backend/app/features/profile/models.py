from enum import Enum
from typing import Literal

from pydantic import Field

from app.features.auth.rbac import USER, Grant
from app.utils.api_model import E164, ApiModel, new_id


class HumanStatus(str, Enum):
    ONLINE = "online"
    BUSY = "busy"
    OFFLINE = "offline"


class Human(ApiModel):
    id: str = Field(default_factory=lambda: new_id("hum"))
    name: str
    phone: str  # E.164 — Twilio rings this number to bridge the caller
    status: HumanStatus = HumanStatus.OFFLINE
    push_token: str | None = None  # Expo push token
    uid: str | None = None  # Firebase user this profile belongs to
    email: str | None = None
    role: str = USER  # a role id from app/features/auth/rbac.py (built-in or custom)
    grants: dict[str, Grant] = Field(default_factory=dict)  # permissions allowed / denied on top of the role
    account_state: Literal["active", "suspended"] = "active"


class RegisterHumanRequest(ApiModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(pattern=E164)
    push_token: str | None = Field(default=None, max_length=256)


class UpdateHumanStatusRequest(ApiModel):
    status: HumanStatus
