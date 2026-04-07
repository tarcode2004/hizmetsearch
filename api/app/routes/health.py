"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_retrieval_pipeline, get_pipeline_settings
from app.schemas import HealthResponse
from hizmetrag.retrieval.pipeline import RetrievalPipeline
from hizmetrag.config import Settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health(
    pipeline: RetrievalPipeline = Depends(get_retrieval_pipeline),
    settings: Settings = Depends(get_pipeline_settings),
):
    try:
        info = pipeline.store.client.get_collection(settings.qdrant_collection)
        return HealthResponse(
            status="ok",
            qdrant_connected=True,
            collection_name=settings.qdrant_collection,
            vectors_count=info.vectors_count or 0,
        )
    except Exception as e:
        return HealthResponse(
            status=f"degraded: {e}",
            qdrant_connected=False,
            collection_name=settings.qdrant_collection,
        )
