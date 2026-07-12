"""FastAPI application — exposes HizmetRAG retrieval pipeline over HTTP."""

from __future__ import annotations

import atexit
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from posthog import Posthog
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.routes import search, health, tools

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Rate limiter ─────────────────────────────────────────────────────────────
# IP-based by default. Convex actions all share their outbound IP, so a high
# default limit + a separate "trusted backend" bypass via the X-API-Key
# header is the right shape: anonymous browsers get throttled, the Convex
# backend is unmetered (because it presents the shared RAG_API_KEY).
def _presented_token(request: Request) -> str:
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


def _rate_key(request: Request) -> str:
    # Convex / FastAPI backend traffic that presents the shared API key gets
    # a single high-cap bucket so legitimate server-to-server load isn't
    # throttled. Anonymous traffic is bucketed per IP.
    token = _presented_token(request)
    if token and token == os.getenv("RAG_API_KEY", ""):
        return "trusted-backend"
    return get_remote_address(request)


limiter = Limiter(
    key_func=_rate_key,
    default_limits=["120/minute", "1000/hour"],
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — initialize and shut down PostHog."""
    posthog_client = Posthog(
        project_api_key=os.environ.get("POSTHOG_PROJECT_TOKEN", ""),
        host=os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com"),
        enable_exception_autocapture=True,
    )
    atexit.register(posthog_client.shutdown)
    app.state.posthog = posthog_client
    yield
    posthog_client.shutdown()


app = FastAPI(
    title="HizmetRAG API",
    description="Semantic search API for Islamic scholarship",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow the production web origin and local dev. Add new origins via
# the WEB_ORIGINS env var (comma-separated) so we don't have to redeploy to
# accept a new domain.
_default_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://hizmetsearch.netlify.app",
    "https://hizmetsearch.com",
]
_extra = [o.strip() for o in os.getenv("WEB_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# API key auth
RAG_API_KEY = os.getenv("RAG_API_KEY", "")


@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    # Health check is always public
    if request.url.path == "/api/health":
        return await call_next(request)
    if RAG_API_KEY:
        key = _presented_token(request)
        if key != RAG_API_KEY:
            app.state.posthog.capture(
                distinct_id="hizmetsearch-api-server",
                event="api_unauthorized_access",
                properties={"path": request.url.path},
            )
            # NB: return a response instead of raising — HTTPException
            # raised inside raw ASGI middleware bypasses FastAPI's
            # exception handlers and surfaces as a 500 (the old Fly
            # deployment had exactly that bug).
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing bearer token / API key"},
            )
    return await call_next(request)


app.include_router(search.router, prefix="/api")
app.include_router(health.router, prefix="/api")
app.include_router(tools.router, prefix="/tools")


@app.get("/")
async def root():
    return {"service": "HizmetRAG API", "docs": "/docs"}
