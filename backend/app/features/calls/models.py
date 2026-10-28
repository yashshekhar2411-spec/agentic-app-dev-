from datetime import datetime
from enum import Enum

from pydantic import Field

from app.utils.api_model import E164, ApiModel, new_id, now


class CallStatus(str, Enum):
    AI_ACTIVE = "ai_active"
    AWAITING_HUMAN = "awaiting_human"
    HUMAN_ACTIVE = "human_active"
    VOICEMAIL = "voicemail"
    ENDED = "ended"


class CallDirection(str, Enum):
    INBOUND = "inbound"  # the customer called us
    OUTBOUND = "outbound"  # an agent dialled the customer from the app and the AI talks to them


class Speaker(str, Enum):
    CALLER = "caller"
    AI = "ai"
    SYSTEM = "system"


class Disposition(str, Enum):
    """How the call ended up, as the agent records it."""

    RESOLVED = "resolved"
    FOLLOW_UP = "follow_up"
    CALLBACK = "callback"
    INTERESTED = "interested"
    NOT_INTERESTED = "not_interested"
    WRONG_NUMBER = "wrong_number"
    NO_ANSWER = "no_answer"


class Turn(ApiModel):
    speaker: Speaker
    text: str
    at: datetime = Field(default_factory=now)


class Call(ApiModel):
    id: str = Field(default_factory=lambda: new_id("call"))
    from_number: str = "unknown"  # the customer's number, whichever side dialled
    direction: CallDirection = CallDirection.INBOUND
    purpose: str = ""  # outbound only: what the AI should call about
    twilio_call_sid: str | None = None
    status: CallStatus = CallStatus.AI_ACTIVE
    started_at: datetime = Field(default_factory=now)
    ended_at: datetime | None = None
    transcript: list[Turn] = Field(default_factory=list)
    handoff_id: str | None = None
    voicemail_url: str | None = None
    # Filled in by agents in the app after (or during) the call
    notes: str = ""
    tags: list[str] = Field(default_factory=list)
    disposition: Disposition | None = None


class SimulateStartRequest(ApiModel):
    from_number: str = Field(default="+910000000000", pattern=E164)


class SimulateSayRequest(ApiModel):
    text: str = Field(max_length=2000)


class OutboundCallRequest(ApiModel):
    to: str = Field(pattern=E164)
    purpose: str = Field(default="", max_length=500)


class CallNotesUpdate(ApiModel):
    """Only the fields sent are changed."""

    notes: str | None = Field(default=None, max_length=4000)
    tags: list[str] | None = Field(default=None, max_length=12)
    disposition: Disposition | None = None
