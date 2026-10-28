from app.utils.api_model import ApiModel
from app.features.handoff.models import HandoffReason


class AgentReply(ApiModel):
    """What the AI says back after a caller turn, and whether it is handing off."""

    text: str
    handoff_reason: HandoffReason | None = None
    handoff_detail: str = ""
    urgency: str = "normal"
    end_call: bool = False
