# HizmetSearch FastAPI image.
#
# IMPORTANT: build context must be the repo root (one level above
# `hizmetsearch/`), so this image can COPY both the Python pipeline source
# (`src/hizmetrag/`) and the FastAPI app (`hizmetsearch/api/app/`):
#
#   docker build -f hizmetsearch/api/Dockerfile -t hizmetsearch-api .
#
# Or via Fly:
#
#   cd hizmetsearch/api
#   fly deploy --dockerfile Dockerfile --build-context ../..

FROM python:3.11-slim

WORKDIR /app

# System deps for native wheels (tiktoken, qdrant-client, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

# Copy the Python RAG pipeline source (built from repo root context)
COPY src/ /app/src/
COPY pyproject.toml /app/pyproject.toml

# Copy the FastAPI app
COPY hizmetsearch/api/app /app/app

# Install the hizmetrag library + API runtime deps. We pip-install
# from the local source so the api Docker image doesn't need to fetch
# the package over the network.
RUN pip install --no-cache-dir -e "/app[reranker]" 2>/dev/null \
 || pip install --no-cache-dir -e "/app"
RUN pip install --no-cache-dir fastapi 'uvicorn[standard]' slowapi posthog

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
