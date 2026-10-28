"""Writes the short brief a human reads before taking over a call."""

from app.config.settings import get_settings
from app.features.agent.claude_client import get_client


class Summarizer:
    def __init__(self) -> None:
        self.settings = get_settings()
        # Runs in the background, so it can wait and retry longer than a caller turn
        self.client = get_client().with_options(timeout=30, max_retries=2)

    async def summarize(self, transcript_text: str, reason: str) -> str:
        response = await self.client.beta.messages.create(
            model=self.settings.claude_model,
            max_tokens=4000,
            output_config={"effort": "low"},
            system=(
                "You brief a human support agent who is about to take over a phone call from an AI assistant. "
                "In at most three short sentences say: who the caller is, what they want, what the AI already tried "
                "or found, and why it is being handed over. Plain text only."
            ),
            messages=[{"role": "user", "content": f"Handoff reason: {reason}\n\nTranscript:\n{transcript_text}"}],
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason == "refusal":
            return ""
        return " ".join(b.text for b in response.content if b.type == "text").strip()
