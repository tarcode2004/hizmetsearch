"""Dependency injection — singleton pipeline instances."""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

# Add the HizmetRAG src to Python path
_rag_src = Path(__file__).resolve().parents[2] / ".." / "src"
if str(_rag_src) not in sys.path:
    sys.path.insert(0, str(_rag_src))

from hizmetrag.config import get_settings, Settings
from hizmetrag.embedding.gemini import GeminiEmbedder
from hizmetrag.embedding.sparse import SparseEncoder
from hizmetrag.indexing.qdrant_store import QdrantStore
from hizmetrag.retrieval.pipeline import RetrievalPipeline


@lru_cache(maxsize=1)
def get_pipeline_settings() -> Settings:
    return get_settings()


@lru_cache(maxsize=1)
def get_retrieval_pipeline() -> RetrievalPipeline:
    settings = get_pipeline_settings()
    embedder = GeminiEmbedder(settings)
    sparse_encoder = SparseEncoder()
    store = QdrantStore(settings)
    return RetrievalPipeline(settings, embedder, sparse_encoder, store)
