"""Keyword stand-in used when no ANTHROPIC_API_KEY is set, so the call + handoff flow can be tried offline.
Uses the same tools as the real agent but none of its understanding."""

import re

from app.features.agent.brains.base import TRANSFER_LINE
from app.features.agent.tools import BUSINESS_TOOLS
from app.storage.store import ConversationState
from app.features.agent.models import AgentReply
from app.features.handoff.models import HandoffReason


class DemoBrain:
    _ORDER = re.compile(r"\bORD[-\s]?(\d+)\b", re.I)
    _OUT_OF_SCOPE = re.compile(r"\b(refund|cancel|complain|complaint|bill|billing|charged|money back|broken|damaged)\b", re.I)
    _DONE = re.compile(r"\b(bye|goodbye|that'?s all|nothing else|no thanks)\b", re.I)

    async def respond(self, state: ConversationState, caller_text: str) -> AgentReply:
        state.messages.append({"role": "user", "content": caller_text})
        text = caller_text.split("\n", 1)[-1]  # drop the [Call details] line
        if self._OUT_OF_SCOPE.search(text):
            return AgentReply(
                text=TRANSFER_LINE,
                handoff_reason=HandoffReason.AGENT_DECIDED,
                handoff_detail=f'Out of scope for the AI: "{text}"',
            )
        if self._DONE.search(text):
            return AgentReply(text="Thanks for calling. Have a great day!", end_call=True)
        if match := self._ORDER.search(text):
            order = await BUSINESS_TOOLS["check_order"](order_id=f"ORD-{match.group(1)}")
            if order.get("found") is False:
                return AgentReply(text=f"I couldn't find order {match.group(1)}. Could you check the number?")
            return AgentReply(text=f"Your order is {order['status'].replace('_', ' ')} and should arrive {order['expected_delivery']}.")
        if re.search(r"\b(order|delivery|package|parcel)\b", text, re.I):
            return AgentReply(text="Sure, what's your order number? It starts with O R D.")
        if re.search(r"\b(book|appointment|visit|schedule)\b", text, re.I):
            return AgentReply(text="Done. I've booked a service visit for you. Your confirmation number is A P T 7 7 8 1.")
        return AgentReply(text="I can check your order status or book a service visit. What would you like to do?")
