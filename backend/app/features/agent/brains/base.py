"""The interface every AI implementation (Claude, demo, test fakes) follows."""

from typing import Protocol

from app.storage.store import ConversationState
from app.features.agent.models import AgentReply

TRANSFER_LINE = "Let me connect you with a colleague who can help. Please stay on the line."


class Brain(Protocol):
    async def respond(self, state: ConversationState, caller_text: str) -> AgentReply: ...
