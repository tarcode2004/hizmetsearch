"""Request/response models for the HizmetRAG API."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    language: Optional[str] = Field(default=None, pattern=r"^(tr|ar|en|tr\+ar|ota)$")
    collection: Optional[str] = None
    # Logical category that the API translates into a multi-criteria filter.
    # See `app.routes.search.CATEGORY_SPECS`. When set, takes precedence over
    # the bare `collection` field.
    category: Optional[str] = Field(default=None, pattern=r"^(risale|risale_dersleri|pirlanta|hizmet)$")
    use_reranker: bool = True


class ChunkResponse(BaseModel):
    chunk_id: str
    doc_id: str
    text: str
    parent_text: Optional[str] = None
    source_type: str
    language: str
    collection: str
    title: str
    author_speaker: str
    publisher: str
    chapter_section: str
    page_number: Optional[int] = None
    timestamp_start: Optional[float] = None
    timestamp_end: Optional[float] = None
    source_url: Optional[str] = None
    source_ext: Optional[str] = None


class SearchResultItem(BaseModel):
    chunk: ChunkResponse
    score: float
    rerank_score: Optional[float] = None


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    query: str
    result_count: int
    retrieval_time_ms: float


class HealthResponse(BaseModel):
    status: str
    qdrant_connected: bool
    collection_name: str
    vectors_count: int = 0
