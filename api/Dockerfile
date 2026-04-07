FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential && rm -rf /var/lib/apt/lists/*

# Copy RAG pipeline source
COPY ../src/hizmetrag /app/src/hizmetrag

# Copy API code
COPY api/app /app/app
COPY api/pyproject.toml /app/

# Install dependencies
RUN pip install --no-cache-dir -e "/app/src[reranker]" 2>/dev/null || true
RUN pip install --no-cache-dir fastapi uvicorn[standard] slowapi

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
