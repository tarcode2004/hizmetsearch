"""
Integration tests for the FastAPI rate limiter.

The /api/search route is decorated with `@_search_limiter.limit("30/minute")`
in app/routes/search.py. We hammer it 31 times in a row and assert that the
31st response is 429.

These tests use a stubbed retrieval pipeline (see conftest.py) so they
don't need Qdrant + Gemini.
"""
from __future__ import annotations


def test_search_rate_limit_kicks_in(client):
    """31st call inside the per-IP minute window should be 429."""
    payload = {"query": "iman", "top_k": 3}

    # First 30 should pass
    statuses = []
    for _ in range(30):
        r = client.post("/api/search", json=payload)
        statuses.append(r.status_code)
    assert all(s == 200 for s in statuses), f"Pre-limit failures: {statuses}"

    # 31st should be rate limited
    r = client.post("/api/search", json=payload)
    assert r.status_code == 429, (
        f"Expected 429 on 31st call, got {r.status_code}: {r.text}"
    )


def test_health_endpoint_not_rate_limited(client):
    """Health checks must always pass — they don't go through the limiter."""
    for _ in range(50):
        r = client.get("/api/health")
        # The health endpoint may legitimately 503 if Qdrant isn't reachable,
        # but it must NEVER 429.
        assert r.status_code != 429


def test_search_returns_stub_results(client):
    r = client.post("/api/search", json={"query": "iman", "top_k": 3})
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "iman"
    assert body["result_count"] == 3
    assert len(body["results"]) == 3
    assert body["results"][0]["chunk"]["title"] == "Stub Source"
