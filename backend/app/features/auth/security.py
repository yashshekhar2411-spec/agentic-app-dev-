"""Auth for the agent app's REST + WebSocket API. Twilio webhooks use signature checks instead.

Two kinds of credentials are accepted as `Authorization: Bearer <token>`:
- a Firebase ID token from a signed-in agent (Google or email/password), when FIREBASE_PROJECT_ID is set;
- the shared API_TOKEN, for scripts and server-to-server use.
With neither configured the API is open (local development only).
"""

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass

import jwt
from fastapi import HTTPException, Request, WebSocket, status

from app.config.settings import get_settings

log = logging.getLogger(__name__)

_FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
_jwks = jwt.PyJWKClient(_FIREBASE_JWKS_URL, cache_jwk_set=True, lifespan=3600)


@dataclass(frozen=True)
class Principal:
    """Who is calling. `uid` is set for Firebase users, None for the shared API token or open dev mode."""

    uid: str | None = None
    email: str | None = None
    name: str | None = None


ANONYMOUS = Principal()


# The app sends the same ID token on every request for up to an hour, so remember tokens already
# verified instead of re-checking the RSA signature on a worker thread each time.
_CACHE_TTL_S = 300
_CACHE_MAX = 10_000
_verified: dict[tuple[str, str], tuple[dict, float]] = {}


async def _cached_claims(token: str, project_id: str) -> dict:
    key = (token, project_id)
    now = time.time()
    hit = _verified.get(key)
    if hit and hit[1] > now:
        return hit[0]
    # The key fetch is blocking on a cache miss, so keep it off the event loop
    claims = await asyncio.to_thread(_verify_firebase_token, token, project_id)
    if len(_verified) >= _CACHE_MAX:
        _verified.clear()
    _verified[key] = (claims, min(float(claims.get("exp", now + _CACHE_TTL_S)), now + _CACHE_TTL_S))
    return claims


def _verify_firebase_token(token: str, project_id: str) -> dict:
    key = _jwks.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience=project_id,
        issuer=f"https://securetoken.google.com/{project_id}",
        options={"require": ["exp", "iat", "sub", "aud", "iss"]},
    )


async def authenticate(token: str | None) -> Principal | None:
    """Returns the caller, or None if the token is missing or invalid."""
    s = get_settings()
    if not s.api_token and not s.firebase_project_id:
        return ANONYMOUS
    if not token:
        return None
    if s.api_token and secrets.compare_digest(token, s.api_token):
        return ANONYMOUS
    if s.firebase_project_id:
        try:
            claims = await _cached_claims(token, s.firebase_project_id)
        except (jwt.PyJWTError, OSError) as exc:
            log.info("rejected Firebase token: %s", exc)
            return None
        return Principal(uid=claims["sub"], email=claims.get("email"), name=claims.get("name"))
    return None


async def require_principal(request: Request) -> Principal:
    header = request.headers.get("Authorization", "")
    token = header[7:].strip() if header.startswith("Bearer ") else None
    principal = await authenticate(token)
    if principal is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in again: missing or expired credentials")
    request.state.principal = principal
    return principal


def current_principal(request: Request) -> Principal:
    """The caller checked by require_principal (applied to every protected router)."""
    return getattr(request.state, "principal", ANONYMOUS)


async def websocket_principal(ws: WebSocket) -> Principal | None:
    # React Native can't set headers on a WebSocket, so the token comes in the query string
    return await authenticate(ws.query_params.get("token"))
