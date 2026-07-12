"""Shared rate-limit plumbing.

One Limiter instance keyed by `rate_key`: requests presenting the shared
RAG_API_KEY (the Convex backend and the FastAPI-to-FastAPI callers) fall
into a single high-cap "trusted-backend" bucket so legitimate
server-to-server load is never throttled by the per-IP limits meant for
anonymous browsers. Lives in its own module so both `app.main` (auth
middleware) and the route modules can import it without a circular
import through `app.main`.
"""

from __future__ import annotations

import os
import secrets

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

# Bucket name used for traffic that presented the shared API key.
TRUSTED_BUCKET = "trusted-backend"


def presented_token(request: Request) -> str:
    """The credential the caller presented, from either supported header.

    `Authorization: Bearer <token>` is the canonical scheme for the tool
    server; `X-API-Key: <token>` is kept for byte-compatibility with the
    existing Convex ragClient.
    """
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        return api_key
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[len("Bearer "):].strip()
    return ""


def token_matches(token: str, expected: str) -> bool:
    """Constant-time credential comparison (never a plain ==)."""
    if not token or not expected:
        return False
    return secrets.compare_digest(
        token.encode("utf-8"), expected.encode("utf-8")
    )


def rate_key(request: Request) -> str:
    """Rate-limit bucket for a request.

    Traffic that presents the shared RAG_API_KEY gets the single
    high-cap trusted bucket; everything else is bucketed per client IP.
    """
    token = presented_token(request)
    if token_matches(token, os.getenv("RAG_API_KEY", "")):
        return TRUSTED_BUCKET
    return get_remote_address(request)


def search_rate_limit(key: str) -> str:
    """Dynamic limit for /api/search, per bucket.

    The trusted bucket funnels ALL production users through one key
    (Convex egresses from effectively one place), so its cap only exists
    to contain a runaway loop — it must never bite under normal load.
    Anonymous per-IP traffic keeps the tight anti-scraping cap.
    """
    return "2000/minute" if key == TRUSTED_BUCKET else "30/minute"


# Modest safety cap for the /tools/* corpus endpoints. They are bearer-
# authed (effectively only the Convex research loop calls them, ~16
# calls per deep-research answer), so this exists purely to bound the
# damage of a runaway agent loop or a leaked key.
TOOLS_RATE_LIMIT = "300/minute"

# Single limiter shared by all route decorators; also installed as
# `app.state.limiter` (slowapi's 429 handler needs it there).
limiter = Limiter(key_func=rate_key)
