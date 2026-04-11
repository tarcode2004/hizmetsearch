"""FastAPI application — exposes HizmetRAG retrieval pipeline over HTTP."""

from __future__ import annotations

import atexit
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from posthog import Posthog
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.routes import search, health

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Rate limiter ─────────────────────────────────────────────────────────────
# IP-based by default. Convex actions all share their outbound IP, so a high
# default limit + a separate "trusted backend" bypass via the X-API-Key
# header is the right shape: anonymous browsers get throttled, the Convex
# backend is unmetered (because it presents the shared RAG_API_KEY).
def _rate_key(request: Request) -> str:
    # Convex / FastAPI backend traffic that presents the shared API key gets
    # a single high-cap bucket so legitimate server-to-server load isn't
    # throttled. Anonymous traffic is bucketed per IP.
    api_key = request.headers.get("X-API-Key", "")
    if api_key and api_key == os.getenv("RAG_API_KEY", ""):
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
        key = request.headers.get("X-API-Key", "")
        if key != RAG_API_KEY:
            app.state.posthog.capture(
                distinct_id="hizmetsearch-api-server",
                event="api_unauthorized_access",
                properties={"path": request.url.path},
            )
            raise HTTPException(status_code=401, detail="Invalid API key")
    return await call_next(request)


app.include_router(search.router, prefix="/api")
app.include_router(health.router, prefix="/api")


@app.get("/")
async def root():
    return {"service": "HizmetRAG API", "docs": "/docs"}
