"""
Pytest fixtures for the FastAPI test suite.

We replace the heavyweight retrieval pipeline with a tiny stub so tests can
run in CI without Qdrant + Gemini being available.

Auth: the app fails CLOSED when RAG_API_KEY is unset (every route except
/api/health answers 503), so the fixtures set a test key and the default
`client` presents it as a bearer token. Use `anon_client` for requests
without credentials.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import pytest

# Make sure the FastAPI app is importable from the api/ directory
_API_DIR = Path(__file__).resolve().parents[1]
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

TEST_RAG_KEY = "test-rag-key"


# ── Stub retrieval pipeline ───────────────────────────────────────────────


@dataclass
class _StubChunk:
    chunk_id: str = "chunk-1"
    doc_id: str = "doc-1"
    text: str = "stub passage text"
    parent_text: str | None = None
    source_type: str = "text"
    language: str = "tr"
    collection: str = "Test"
    title: str = "Stub Source"
    author_speaker: str = "Author"
    publisher: str = ""
    chapter_section: str = ""
    page_number: int | None = 1
    timestamp_start: float | None = None
    timestamp_end: float | None = None


@dataclass
class _StubResult:
    chunk: _StubChunk
    score: float = 0.95
    rerank_score: float | None = 0.99


class _StubPipeline:
    def retrieve(self, query, top_k=5, language=None, collection=None, use_reranker=True):
        return [_StubResult(chunk=_StubChunk()) for _ in range(min(top_k, 3))]


def _build_app(monkeypatch: pytest.MonkeyPatch, rag_key: str | None):
    if rag_key is None:
        monkeypatch.delenv("RAG_API_KEY", raising=False)
    else:
        monkeypatch.setenv("RAG_API_KEY", rag_key)

    # Force a fresh import so module-level state (rate limiter buckets,
    # the RAG_API_KEY snapshot) resets between tests.
    for mod in list(sys.modules):
        if mod.startswith("app.") or mod == "app":
            del sys.modules[mod]

    from app.main import app as fastapi_app
    from app import deps

    # Replace the heavy pipeline factory with the stub
    fastapi_app.dependency_overrides[deps.get_retrieval_pipeline] = lambda: _StubPipeline()
    return fastapi_app


@pytest.fixture
def app(monkeypatch: pytest.MonkeyPatch) -> Iterator:
    fastapi_app = _build_app(monkeypatch, TEST_RAG_KEY)
    yield fastapi_app
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def keyless_app(monkeypatch: pytest.MonkeyPatch) -> Iterator:
    """App started WITHOUT RAG_API_KEY — must fail closed (503)."""
    fastapi_app = _build_app(monkeypatch, None)
    yield fastapi_app
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def client(app):
    """Authenticated client (presents the shared bearer token)."""
    from fastapi.testclient import TestClient

    # Context manager so the lifespan runs (initializes app.state.posthog).
    with TestClient(app) as c:
        c.headers["Authorization"] = f"Bearer {TEST_RAG_KEY}"
        yield c


@pytest.fixture
def anon_client(app):
    """Client with no credentials."""
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        yield c
