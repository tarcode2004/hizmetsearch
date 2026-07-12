"""Health check endpoint."""

from __future__ import annotations

import asyncio
from fastapi import APIRouter, Depends, Request

from app.deps import get_retrieval_pipeline, get_pipeline_settings
from app.schemas import HealthResponse
from hizmetrag.retrieval.pipeline import RetrievalPipeline
from hizmetrag.config import Settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health(
    request: Request,
    pipeline: RetrievalPipeline = Depends(get_retrieval_pipeline),
    settings: Settings = Depends(get_pipeline_settings),
):
    try:
        # The retrieval client deliberately allows slow 60s searches, but a
        # liveness probe must never inherit that timeout. Bound the dependency
        # check so Fly can keep routing to a healthy API process while still
        # reporting Qdrant as degraded in the response body.
        info = await asyncio.wait_for(
            asyncio.to_thread(
                pipeline.store.client.get_collection,
                settings.qdrant_collection,
            ),
            timeout=3,
        )
        # qdrant-client 1.10+ removed `vectors_count` from CollectionInfo;
        # use `points_count` instead. Keep `vectors_count` as a fallback so
        # this still works against older Qdrant versions.
        count = (
            getattr(info, "points_count", None)
            or getattr(info, "vectors_count", None)
            or 0
        )
        return HealthResponse(
            status="ok",
            qdrant_connected=True,
            collection_name=settings.qdrant_collection,
            vectors_count=count,
        )
    except Exception as e:
        request.app.state.posthog.capture(
            distinct_id="hizmetsearch-api-server",
            event="api_health_degraded",
            properties={
                "collection_name": settings.qdrant_collection,
                "error_type": type(e).__name__,
            },
        )
        return HealthResponse(
            status=f"degraded: {e}",
            qdrant_connected=False,
            collection_name=settings.qdrant_collection,
        )
