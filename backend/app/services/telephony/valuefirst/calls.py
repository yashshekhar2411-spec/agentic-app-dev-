"""ValueFirst (Infinito) outbound voice: rings a customer by triggering a voice campaign set up in the
ValueFirst portal. ValueFirst then reports how the call went to /valuefirst/dlr (see webhooks.py).

What the customer hears is whatever that campaign is configured to play or connect to.
"""

import logging

import httpx

from app.config.settings import get_settings
from app.features.calls.models import Call
from app.services.telephony.urls import public_url

log = logging.getLogger(__name__)


class ValueFirstError(Exception):
    pass


def configured() -> bool:
    s = get_settings()
    return bool(s.valuefirst_api_token and s.valuefirst_campaign_id)


def local_number(e164: str) -> str:
    """ValueFirst takes Indian numbers as 10 digits (e.g. 9911571741); others without the +."""
    return e164[3:] if e164.startswith("+91") and len(e164) == 13 else e164.lstrip("+")


_http: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    # One shared client so calls reuse the connection to ValueFirst
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=15)
    return _http


async def close() -> None:
    global _http
    if _http is not None:
        await _http.aclose()
        _http = None


async def dial_customer(call: Call) -> str:
    """Triggers the campaign for call.from_number. Returns ValueFirst's id for the request."""
    s = get_settings()
    payload = {
        "apiver": "1.0",
        "voice": {
            "ver": "2.0",
            "dlr": {"url": public_url("/valuefirst/dlr", call_id=call.id)},
            "messages": [
                {
                    "id": call.id,  # comes back in delivery reports
                    "campaignid": s.valuefirst_campaign_id,
                    "addresses": [
                        {"to": local_number(call.from_number), "seq": "1", "customdata": {"callId": call.id}}
                    ],
                }
            ],
        },
    }
    try:
        res = await _client().post(
            s.valuefirst_api_url, json=payload, headers={"Authorization": f"Bearer {s.valuefirst_api_token}"}
        )
    except httpx.HTTPError as exc:
        raise ValueFirstError(f"can't reach ValueFirst: {exc}") from exc
    log.info("ValueFirst send for %s -> HTTP %s %s", call.id, res.status_code, res.text[:500])
    try:
        body = res.json()
    except ValueError:
        body = {}
    if res.status_code >= 400:
        # e.g. {"status":"Error","statuscode":52996,"statustext":"Invalid Authorization Token"}
        reason = body.get("statustext") or body.get("message") or body.get("error") or res.text[:300]
        code = body.get("statuscode")
        raise ValueFirstError(f"{reason} (HTTP {res.status_code}{f', code {code}' if code else ''})")
    # Error details can come back with HTTP 200, so look inside the body too
    status = str(body.get("status") or body.get("statusCode") or "").lower()
    if status in {"error", "failed", "failure"} or body.get("error"):
        raise ValueFirstError(str(body.get("statustext") or body.get("error") or body.get("message") or body)[:300])
    return str(body.get("requestid") or body.get("requestId") or body.get("id") or call.id)
