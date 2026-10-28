"""ElevenLabs Agents API: places the AI's outbound calls and reads conversations (live and finished).

ElevenLabs runs the whole phone conversation (speech to text, the AI, text to speech) on a phone number that was
imported into it from Twilio or a SIP trunk. This server only starts calls and mirrors what happens (see sync.py).
"""

import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.config.settings import get_settings
from app.features.calls.models import Call

log = logging.getLogger(__name__)


class ElevenLabsError(Exception):
    pass


def configured() -> bool:
    s = get_settings()
    return bool(s.eleven_labs_api_key and s.eleven_labs_agent_id and s.eleven_labs_caller_id)


_http: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    # One shared client so every call reuses the connection to ElevenLabs
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=20)
    return _http


async def close() -> None:
    global _http
    if _http is not None:
        await _http.aclose()
        _http = None


def _reason(res: httpx.Response) -> str:
    """ElevenLabs sends {"detail": {"message": ...}}, {"detail": "..."} or a list of validation errors."""
    try:
        detail = res.json().get("detail")
    except ValueError:
        detail = None
    if isinstance(detail, dict):
        detail = detail.get("message") or detail.get("status")
    elif isinstance(detail, list):
        detail = "; ".join(str(d.get("msg", d)) if isinstance(d, dict) else str(d) for d in detail)
    return str(detail or res.text[:300] or f"HTTP {res.status_code}")


async def _request(method: str, path: str, **kw: Any) -> Any:
    s = get_settings()
    try:
        res = await _client().request(
            method, s.eleven_labs_api_url.rstrip("/") + path, headers={"xi-api-key": s.eleven_labs_api_key}, **kw
        )
    except httpx.HTTPError as exc:
        raise ElevenLabsError(f"can't reach ElevenLabs: {exc}") from exc
    if res.status_code >= 400:
        raise ElevenLabsError(f"{_reason(res)} (HTTP {res.status_code})")
    try:
        return res.json()
    except ValueError as exc:
        raise ElevenLabsError(f"unexpected reply: {res.text[:200]}") from exc


@dataclass(frozen=True)
class AgentNumber:
    id: str  # phnum_...
    provider: str  # twilio | sip_trunk | exotel
    phone: str
    can_dial_out: bool = True  # False for a number set up for incoming calls only (a SIP trunk with no outbound trunk)


_number: tuple[str, AgentNumber] | None = None  # (what ELEVEN_LABS_CALLER_ID said, what it resolved to)


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


async def agent_number() -> AgentNumber:
    """The phone number the AI calls from. ELEVEN_LABS_CALLER_ID can be its phnum_ id or the number itself."""
    global _number
    ident = get_settings().eleven_labs_caller_id.strip()
    if _number and _number[0] == ident:
        return _number[1]
    numbers = await _request("GET", "/v1/convai/phone-numbers")
    want = _digits(ident)
    for n in numbers:
        by_id = n.get("phone_number_id") == ident
        by_number = bool(want) and not ident.startswith("phnum_") and _digits(n.get("phone_number", "")).endswith(want)
        if by_id or by_number:
            found = AgentNumber(
                n["phone_number_id"], n.get("provider", "twilio"), n.get("phone_number", ""), n.get("supports_outbound", True) is not False
            )
            _number = (ident, found)
            return found
    shown = f"…{want[-3:]}" if want else ident[:8]
    raise ElevenLabsError(
        f"No phone number matching {shown} is set up in ElevenLabs. In ElevenLabs go to Agents → Phone numbers, "
        "import your Twilio or SIP trunk number, and put its phnum_ ID (or the number) in ELEVEN_LABS_CALLER_ID."
    )


async def place_call(call: Call) -> str | None:
    """Rings the customer (call.from_number) and puts the agent on the line. Returns the conversation id, if known yet."""
    s = get_settings()
    number = await agent_number()
    if not number.can_dial_out:
        raise ElevenLabsError(
            f"The ElevenLabs number {number.phone} can only receive calls. In ElevenLabs go to Agents → Phone numbers, "
            "open it and add an outbound trunk (your SIP provider's address and login), or import a number that can call out."
        )
    if number.provider == "twilio":
        path = "/v1/convai/twilio/outbound-call"
    elif number.provider == "sip_trunk":
        path = "/v1/convai/sip-trunk/outbound-call"
    else:
        raise ElevenLabsError(f"Calls from a {number.provider} number aren't supported here: import a Twilio or SIP trunk number")
    body = {
        "agent_id": s.eleven_labs_agent_id,
        "agent_phone_number_id": number.id,
        "to_number": call.from_number,
        # Available to the agent's prompt as {{purpose}}, {{company_name}} ... (it only needs to mention them)
        "conversation_initiation_client_data": {
            "dynamic_variables": {
                "purpose": call.purpose or "a quick check-in",
                "company_name": s.company_name,
                "customer_phone": call.from_number,
                "call_id": call.id,
            }
        },
    }
    res = await _request("POST", path, json=body)
    log.info("ElevenLabs outbound call for %s -> %s", call.id, res)
    if res.get("success") is False:
        raise ElevenLabsError(res.get("message") or "ElevenLabs didn't place the call")
    return res.get("conversation_id")


async def list_conversations(after_unix: int, page_size: int = 30) -> list[dict]:
    """The agent's recent conversations, newest first (summaries: no transcript)."""
    res = await _request(
        "GET",
        "/v1/convai/conversations",
        params={"agent_id": get_settings().eleven_labs_agent_id, "call_start_after_unix": after_unix, "page_size": page_size},
    )
    return res.get("conversations") or []


async def get_conversation(conversation_id: str) -> dict:
    """One conversation with its transcript so far."""
    return await _request("GET", f"/v1/convai/conversations/{conversation_id}")
