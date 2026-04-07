"""FastAPI application — exposes HizmetRAG retrieval pipeline over HTTP."""

from __future__ import annotations

import os
import logging

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.routes import search, health

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="HizmetRAG API",
    description="Semantic search API for Islamic scholarship",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://hizmetsearch.netlify.app",
        "https://hizmetsearch.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API key auth
RAG_API_KEY = os.getenv("RAG_API_KEY", "")


@app.middleware("http")
async def api_key_auth(request: Request, call_next):
    if request.url.path == "/api/health":
        return await call_next(request)
    if RAG_API_KEY:
        key = request.headers.get("X-API-Key", "")
        if key != RAG_API_KEY:
            raise HTTPException(status_code=401, detail="Invalid API key")
    return await call_next(request)


app.include_router(search.router, prefix="/api")
app.include_router(health.router, prefix="/api")


@app.get("/")
async def root():
    return {"service": "HizmetRAG API", "docs": "/docs"}
