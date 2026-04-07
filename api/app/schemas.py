"""Request/response models for the HizmetRAG API."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    language: Optional[str] = Field(default=None, pattern=r"^(tr|ar|en|tr\+ar|ota)$")
    collection: Optional[str] = None
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
