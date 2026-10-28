"""Claude-powered agent: runs the tool loop for one caller turn and returns what to say."""

import asyncio
import json
import logging

import anthropic

from app.features.agent.brains.base import TRANSFER_LINE
from app.features.agent.claude_client import get_client
from app.features.agent.prompts import system_prompt
from app.features.agent.tools import BUSINESS_TOOLS, END_CALL, REQUEST_HANDOFF, TOOL_DEFINITIONS
from app.config.settings import get_settings
from app.storage.store import ConversationState
from app.features.agent.models import AgentReply
from app.features.handoff.models import HandoffReason

log = logging.getLogger(__name__)


async def _done(content: str) -> tuple[str, bool]:
    return content, False


class ClaudeBrain:
    def __init__(self) -> None:
        settings = get_settings()
        self.settings = settings
        self.client = get_client()
        self.system = [{"type": "text", "text": system_prompt(), "cache_control": {"type": "ephemeral"}}]

    async def _create(self, messages: list) -> anthropic.types.beta.BetaMessage:
        return await self.client.beta.messages.create(
            model=self.settings.claude_model,
            max_tokens=16000,
            system=self.system,
            tools=TOOL_DEFINITIONS,
            messages=messages,
            # Also cache the conversation so far: each turn re-reads the previous turns instead of reprocessing them
            cache_control={"type": "ephemeral"},
            output_config={"effort": self.settings.claude_effort},
            # If the model declines, the API retries on a fallback model inside the same call
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )

    async def respond(self, state: ConversationState, caller_text: str) -> AgentReply:
        state.messages.append({"role": "user", "content": caller_text})

        for _ in range(self.settings.max_tool_rounds):
            response = await self._create(state.messages)

            if response.stop_reason == "refusal":
                # Drop the refused turn so history stays valid, and let a human take over
                state.messages.pop()
                return AgentReply(text=TRANSFER_LINE, handoff_reason=HandoffReason.MODEL_REFUSAL)

            # Plain JSON so the history can be stored in Redis; blocks (incl. thinking) are sent back unchanged
            state.messages.append({"role": "assistant", "content": [b.to_dict(mode="json") for b in response.content]})
            spoken = " ".join(b.text for b in response.content if b.type == "text").strip()
            tool_uses = [b for b in response.content if b.type == "tool_use"]

            if not tool_uses:
                return AgentReply(text=spoken or "Sorry, could you say that again?")

            handoff_input: dict | None = None
            farewell: str | None = None
            pending = []
            for tool_use in tool_uses:
                tool_input = tool_use.input if isinstance(tool_use.input, dict) else json.loads(tool_use.input)
                if tool_use.name == REQUEST_HANDOFF:
                    handoff_input = tool_input
                    pending.append(_done("Transfer to a human has started."))
                elif tool_use.name == END_CALL:
                    farewell = tool_input.get("farewell") or "Thanks for calling. Goodbye!"
                    pending.append(_done("Call ending."))
                else:
                    pending.append(self._run_tool(state, tool_use.name, tool_input))
            # Business tools (CRM, orders) run in parallel so lookups don't add up on the caller's wait
            outcomes = await asyncio.gather(*pending)
            results = [
                {"type": "tool_result", "tool_use_id": tool_use.id, "content": content, "is_error": is_error}
                for tool_use, (content, is_error) in zip(tool_uses, outcomes)
            ]
            state.messages.append({"role": "user", "content": results})

            if handoff_input is not None:
                return AgentReply(
                    text=handoff_input.get("message_to_caller") or TRANSFER_LINE,
                    handoff_reason=HandoffReason.AGENT_DECIDED,
                    handoff_detail=handoff_input.get("reason", ""),
                    urgency=handoff_input.get("urgency", "normal"),
                )
            if farewell is not None:
                return AgentReply(text=farewell, end_call=True)

        # Tool loop didn't converge — don't keep the caller waiting
        return AgentReply(
            text=TRANSFER_LINE,
            handoff_reason=HandoffReason.AGENT_ERROR,
            handoff_detail="AI could not finish its tool calls",
        )

    async def _run_tool(self, state: ConversationState, name: str, tool_input: dict) -> tuple[str, bool]:
        fn = BUSINESS_TOOLS.get(name)
        if fn is None:
            state.tool_failures += 1
            return f"Unknown tool {name}", True
        try:
            return json.dumps(await fn(**tool_input)), False
        except Exception as exc:  # report tool errors back to the model instead of crashing the call
            log.exception("tool %s failed", name)
            state.tool_failures += 1
            return f"Tool error: {exc}", True
