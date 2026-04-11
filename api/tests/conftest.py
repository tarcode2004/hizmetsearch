"""
Pytest fixtures for the FastAPI test suite.

We replace the heavyweight retrieval pipeline with a tiny stub so tests can
run in CI without Qdrant + Gemini being available.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import pytest

# Make sure the FastAPI app is importable from the api/ directory
_API_DIR = Path(__file__).resolve().parents[1]
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))


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


@pytest.fixture
def app(monkeypatch: pytest.MonkeyPatch) -> Iterator:
    # Disable the API key requirement for tests
    monkeypatch.delenv("RAG_API_KEY", raising=False)

    # Force a fresh import so module-level state (rate limiter buckets) resets
    # between tests.
    for mod in list(sys.modules):
        if mod.startswith("app."):
            del sys.modules[mod]

    from app.main import app as fastapi_app
    from app import deps

    # Replace the heavy pipeline factory with the stub
    fastapi_app.dependency_overrides[deps.get_retrieval_pipeline] = lambda: _StubPipeline()

    yield fastapi_app

    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def client(app):
    from fastapi.testclient import TestClient

    return TestClient(app)
