"""Search endpoint — the core API route."""

from __future__ import annotations

import time
import logging

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.deps import get_retrieval_pipeline
from app.schemas import SearchRequest, SearchResponse, SearchResultItem, ChunkResponse
from hizmetrag.retrieval.pipeline import RetrievalPipeline

logger = logging.getLogger(__name__)
router = APIRouter()

# A second limiter scoped to /api/search specifically. The default app-level
# limiter is intentionally generous; this one tightens search to discourage
# scraping while still allowing normal interactive use.
_search_limiter = Limiter(key_func=get_remote_address)


# Logical category → multi-criteria filter spec.
#
# `risale`            — original Risale-i Nur books and translations.
# `risale_dersleri`   — Risale-i Nur lecture/sohbet audio.
# `pirlanta`          — books authored by Fethullah Gülen.
# `hizmet`            — everything else (other publishers, other authors).
#
# These get translated into Qdrant filter args before the pipeline call.
CATEGORY_SPECS: dict[str, dict] = {
    "risale": {
        "collections": ["Risale-i Nur"],
    },
    "risale_dersleri": {
        "collections": ["Risale-i Nur Dersleri"],
    },
    "pirlanta": {
        # Match author substring — handles "M. Fethullah Gülen", "Fethullah
        # Gülen", "Fethullah GÜLEN" etc.
        "author_prefixes": ["Gülen"],
    },
    "hizmet": {
        # Everything that's NOT Risale and NOT Gülen-authored.
        "exclude_collections": ["Risale-i Nur", "Risale-i Nur Dersleri"],
        "exclude_author_prefixes": ["Gülen"],
    },
}


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
        source_url=getattr(chunk, "source_url", None),
        source_ext=getattr(chunk, "source_ext", None),
    )


@router.post("/search", response_model=SearchResponse)
@_search_limiter.limit("30/minute")
async def search(
    request: Request,  # noqa: ARG001 — required by slowapi to read remote addr
    body: SearchRequest,
    pipeline: RetrievalPipeline = Depends(get_retrieval_pipeline),
):
    # Use X-PostHog-Distinct-ID if the caller (e.g. Convex) forwards it so
    # server-side events correlate with the client-side session.
    distinct_id = (
        request.headers.get("X-PostHog-Distinct-ID")
        or "hizmetsearch-api-server"
    )
    posthog_client = request.app.state.posthog

    start = time.perf_counter()

    # Translate logical category → filter kwargs.
    cat_kwargs: dict = {}
    if body.category and body.category in CATEGORY_SPECS:
        cat_kwargs = dict(CATEGORY_SPECS[body.category])

    try:
        results = pipeline.retrieve(
            query=body.query,
            top_k=body.top_k,
            language=body.language,
            collection=body.collection if not cat_kwargs else None,
            use_reranker=body.use_reranker,
            **cat_kwargs,
        )
    except Exception as exc:
        posthog_client.capture_exception(exc, distinct_id=distinct_id)
        posthog_client.capture(
            distinct_id=distinct_id,
            event="search_failed",
            properties={
                "query_length": len(body.query),
                "language": body.language,
                "category": body.category,
                "error_type": type(exc).__name__,
            },
        )
        raise

    elapsed_ms = (time.perf_counter() - start) * 1000

    items = [
        SearchResultItem(
            chunk=_chunk_to_response(r.chunk),
            score=r.score,
            rerank_score=r.rerank_score,
        )
        for r in results
    ]

    posthog_client.capture(
        distinct_id=distinct_id,
        event="search_performed",
        properties={
            "query_length": len(body.query),
            "result_count": len(items),
            "retrieval_time_ms": round(elapsed_ms, 2),
            "language": body.language,
            "category": body.category,
            "use_reranker": body.use_reranker,
        },
    )

    return SearchResponse(
        results=items,
        query=body.query,
        result_count=len(items),
        retrieval_time_ms=round(elapsed_ms, 2),
    )
