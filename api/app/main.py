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
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.ratelimit import limiter, presented_token, token_matches
from app.routes import search, health, tools

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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

# ── Rate limiting ────────────────────────────────────────────────────────────
# The limiter itself lives in app.ratelimit (shared with the route
# decorators in routes/search.py and routes/tools.py). Trusted-backend
# traffic — anything presenting the shared RAG_API_KEY — gets a single
# high-cap bucket; anonymous traffic is bucketed per IP. slowapi's 429
# handler reads the limiter off app.state.
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

# API key auth — FAIL CLOSED. With the key unset every route except the
# health check refuses to serve (503) instead of silently going public:
# a missing env file must never publish /tools/read_document (full-text
# corpus export) behind valid TLS.
RAG_API_KEY = os.getenv("RAG_API_KEY", "")
if not RAG_API_KEY:
    logger.critical(
        "RAG_API_KEY is not set — refusing to serve authenticated routes "
        "(all requests except /api/health will get 503). Set RAG_API_KEY "
        "and restart."
    )


@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    # Health check is always public
    if request.url.path == "/api/health":
        return await call_next(request)
    # CORS preflights carry no Authorization header by design; hand them
    # to CORSMiddleware (registered later → runs inner) so browsers get
    # proper preflight responses. The actual request that follows still
    # goes through the token check below.
    if request.method == "OPTIONS":
        return await call_next(request)
    if not RAG_API_KEY:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Server misconfigured: RAG_API_KEY is not set"
            },
        )
    key = presented_token(request)
    if not token_matches(key, RAG_API_KEY):
        # Best-effort telemetry — an analytics failure must never turn
        # a 401 into a 500.
        try:
            app.state.posthog.capture(
                distinct_id="hizmetsearch-api-server",
                event="api_unauthorized_access",
                properties={"path": request.url.path},
            )
        except Exception:  # noqa: BLE001
            logger.debug("posthog capture failed in auth reject", exc_info=True)
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
