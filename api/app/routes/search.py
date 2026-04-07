"""Search endpoint — the core API route."""

from __future__ import annotations

import time
import logging

from fastapi import APIRouter, Depends

from app.deps import get_retrieval_pipeline
from app.schemas import SearchRequest, SearchResponse, SearchResultItem, ChunkResponse
from hizmetrag.retrieval.pipeline import RetrievalPipeline

logger = logging.getLogger(__name__)
router = APIRouter()


def _chunk_to_response(chunk) -> ChunkResponse:
    return ChunkResponse(
        chunk_id=chunk.chunk_id,
        doc_id=chunk.doc_id,
        text=chunk.text,
        parent_text=chunk.parent_text,
        source_type=chunk.source_type.value if hasattr(chunk.source_type, "value") else str(chunk.source_type),
        language=chunk.language.value if hasattr(chunk.language, "value") else str(chunk.language),
        collection=chunk.collection,
        title=chunk.title,
        author_speaker=chunk.author_speaker,
        publisher=chunk.publisher,
        chapter_section=chunk.chapter_section,
        page_number=chunk.page_number,
        timestamp_start=chunk.timestamp_start,
        timestamp_end=chunk.timestamp_end,
    )


@router.post("/search", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    pipeline: RetrievalPipeline = Depends(get_retrieval_pipeline),
):
    start = time.perf_counter()

    results = pipeline.retrieve(
        query=request.query,
        top_k=request.top_k,
        language=request.language,
        collection=request.collection,
        use_reranker=request.use_reranker,
    )

    elapsed_ms = (time.perf_counter() - start) * 1000

    items = [
        SearchResultItem(
            chunk=_chunk_to_response(r.chunk),
            score=r.score,
            rerank_score=r.rerank_score,
        )
        for r in results
    ]

    return SearchResponse(
        results=items,
        query=request.query,
        result_count=len(items),
        retrieval_time_ms=round(elapsed_ms, 2),
    )
