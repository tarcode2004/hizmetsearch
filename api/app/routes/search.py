"""Search endpoint — the core API route."""

from __future__ import annotations

import time
import logging

from fastapi import APIRouter, Depends, Request

from app.deps import get_retrieval_pipeline
from app.ratelimit import limiter, search_rate_limit
from app.schemas import SearchRequest, SearchResponse, SearchResultItem, ChunkResponse
from hizmetrag.retrieval.pipeline import RetrievalPipeline
from app.source_priority import infer_source_context, prioritize_results

logger = logging.getLogger(__name__)
router = APIRouter()

# /api/search rate limit — dynamic per bucket (see app.ratelimit):
# trusted-backend traffic (Convex presents the shared RAG_API_KEY, and ALL
# production users funnel through it) gets a high cap that only exists to
# contain runaway loops; anonymous per-IP traffic keeps the tight
# anti-scraping cap.


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
        # Gülen", "Fethullah GÜLEN" etc. Herkul web/sohbet series are
        # supplementary rather than written/Pırlanta books.
        "author_prefixes": ["Gülen"],
        "exclude_collections": [
            "Herkul Kırık Testi",
            "Herkul Nağme",
            "Herkul Bamteli",
        ],
    },
    "hizmet": {
        # Everything that's NOT Risale and NOT Gülen-authored.
        "exclude_collections": ["Risale-i Nur", "Risale-i Nur Dersleri"],
        "exclude_author_prefixes": ["Gülen"],
    },
}

def retrieve_with_source_priority(
    pipeline: RetrievalPipeline,
    *,
    query: str,
    top_k: int,
    language: str | None,
    use_reranker: bool,
):
    context = infer_source_context(query)
    # One retrieval/reranker pass keeps latency and provider cost bounded.
    # A small overfetch gives the priority policy nearby candidates without
    # allowing authority to rescue deeply irrelevant results.
    candidates = pipeline.retrieve(
        query=query,
        top_k=min(max(top_k + 4, top_k * 2), 40),
        language=language,
        use_reranker=use_reranker,
    )
    return prioritize_results(candidates, top_k, context), context


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
@limiter.limit(search_rate_limit)
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
        if body.category or body.collection:
            results = pipeline.retrieve(
                query=body.query,
                top_k=body.top_k,
                language=body.language,
                collection=body.collection if not cat_kwargs else None,
                use_reranker=body.use_reranker,
                **cat_kwargs,
            )
            source_context = body.category or "collection"
        else:
            results, source_context = retrieve_with_source_priority(
                pipeline,
                query=body.query,
                top_k=body.top_k,
                language=body.language,
                use_reranker=body.use_reranker,
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
            "source_context": source_context,
        },
    )

    return SearchResponse(
        results=items,
        query=body.query,
        result_count=len(items),
        retrieval_time_ms=round(elapsed_ms, 2),
    )
