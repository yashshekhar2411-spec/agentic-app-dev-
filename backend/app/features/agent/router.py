"""How the AI agent sounds and behaves on calls, editable from the app's Settings.

Changes apply to the next caller turn straight away and are saved to backend/agent_settings.json, which
overrides backend/.env on the next start. With several server processes, each one only sees the file
when it starts, so change these on a single-process server or restart the others.
"""

import json
import logging
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import Field

from app.features.auth.rbac import require
from app.config.settings import DATA_DIR, get_settings
from app.features.agent import orchestrator
from app.features.agent.prompts import greeting, outbound_greeting
from app.utils.api_model import ApiModel

log = logging.getLogger(__name__)

SAVED_FILE = DATA_DIR / "agent_settings.json"

Language = Literal["en-IN", "hi-IN", "en-US", "en-GB"]

# Twilio <Say> voices that suit Indian and international callers
VOICES = [
    {"id": "Polly.Aditi", "label": "Aditi · Hindi & Indian English, female"},
    {"id": "Polly.Raveena", "label": "Raveena · Indian English, female"},
    {"id": "Polly.Kajal-Neural", "label": "Kajal · Indian English & Hindi, female (natural)"},
    {"id": "Polly.Joanna-Neural", "label": "Joanna · US English, female (natural)"},
    {"id": "Polly.Matthew-Neural", "label": "Matthew · US English, male (natural)"},
    {"id": "Polly.Amy-Neural", "label": "Amy · British English, female (natural)"},
]
LANGUAGES = [
    {"id": "en-IN", "label": "English (India)"},
    {"id": "hi-IN", "label": "Hindi"},
    {"id": "en-US", "label": "English (US)"},
    {"id": "en-GB", "label": "English (UK)"},
]

FIELDS = ("company_name", "call_language", "tts_voice", "custom_greeting", "hold_timeout_s", "max_ai_turns")


class AgentConfig(ApiModel):
    # Not range-checked: these mirror whatever backend/.env holds. Updates are checked in AgentConfigUpdate.
    company_name: str
    call_language: str
    tts_voice: str
    custom_greeting: str = ""
    hold_timeout_s: int  # how long a caller waits for a human
    max_ai_turns: int  # AI hands off after this many turns without resolving


class AgentConfigUpdate(ApiModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=60)
    call_language: Language | None = None
    tts_voice: Literal[tuple(v["id"] for v in VOICES)] | None = None  # type: ignore[valid-type]
    custom_greeting: str | None = Field(default=None, max_length=300)
    hold_timeout_s: int | None = Field(default=None, ge=30, le=600)
    max_ai_turns: int | None = Field(default=None, ge=3, le=40)


class AgentConfigView(ApiModel):
    config: AgentConfig
    greeting_preview: str  # what an inbound caller hears first
    outbound_preview: str  # what someone the AI calls hears first
    voices: list[dict]
    languages: list[dict]


def current() -> AgentConfig:
    s = get_settings()
    return AgentConfig(**{f: getattr(s, f) for f in FIELDS})


def _apply(values: dict) -> None:
    s = get_settings()
    for name, value in values.items():
        setattr(s, name, value)
    # The Claude brain caches its system prompt (company name, greeting): rebuild it on the next turn
    orchestrator.set_brain(None)


def load_saved() -> None:
    """At startup: apply settings saved from the app on top of backend/.env."""
    if not SAVED_FILE.exists():
        return
    try:
        saved = json.loads(SAVED_FILE.read_text(encoding="utf-8"))
        _apply({k: v for k, v in AgentConfigUpdate(**saved).model_dump(exclude_none=True).items()})
        log.info("loaded AI agent settings from %s", SAVED_FILE.name)
    except (OSError, ValueError) as exc:
        log.warning("ignoring %s: %s", SAVED_FILE.name, exc)


def _view() -> AgentConfigView:
    return AgentConfigView(
        config=current(),
        greeting_preview=greeting(),
        outbound_preview=outbound_greeting("your recent order"),
        voices=VOICES,
        languages=LANGUAGES,
    )


router = APIRouter(prefix="/agent-config", tags=["agent-config"])


@router.get("", response_model=AgentConfigView, dependencies=[Depends(require("ai_agent.view"))])
async def get_agent_config() -> AgentConfigView:
    return _view()


@router.patch("", response_model=AgentConfigView, dependencies=[Depends(require("ai_agent.edit"))])
async def update_agent_config(body: AgentConfigUpdate) -> AgentConfigView:
    changes = body.model_dump(exclude_none=True)
    if "custom_greeting" in changes:
        changes["custom_greeting"] = changes["custom_greeting"].strip()
    _apply(changes)
    try:
        SAVED_FILE.write_text(json.dumps(current().model_dump(), indent=2), encoding="utf-8")
    except OSError as exc:
        log.warning("couldn't save AI agent settings: %s", exc)  # still applied until restart
    log.info("AI agent settings changed: %s", sorted(changes))
    return _view()
