from datetime import datetime
from enum import Enum

from pydantic import Field

from app.utils.api_model import ApiModel, new_id, now


class HandoffReason(str, Enum):
    CALLER_REQUESTED_HUMAN = "caller_requested_human"
    AGENT_DECIDED = "agent_decided"
    REPEATED_FAILURE = "repeated_failure"
    TOO_MANY_TURNS = "too_many_turns"
    TOOL_FAILURE = "tool_failure"
    MODEL_REFUSAL = "model_refusal"
    AGENT_ERROR = "agent_error"


class HandoffStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"  # caller left the queue (voicemail / hung up)


class Handoff(ApiModel):
    id: str = Field(default_factory=lambda: new_id("hof"))
    call_id: str
    reason: HandoffReason
    detail: str = ""  # free-text reason, e.g. what the AI said when it escalated
    summary: str = ""  # AI-written brief for the human
    urgency: str = "normal"
    status: HandoffStatus = HandoffStatus.PENDING
    assigned_to: str | None = None
    created_at: datetime = Field(default_factory=now)
    accepted_at: datetime | None = None


class AcceptHandoffRequest(ApiModel):
    human_id: str
