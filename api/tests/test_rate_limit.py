"""
Integration tests for auth + rate limiting.

Auth is fail-closed (503 without RAG_API_KEY configured, 401 without a
valid token) and covers every route except /api/health. Rate limiting is
keyed by `app.ratelimit.rate_key`: traffic presenting the shared key gets
the high-cap "trusted-backend" bucket (so the Convex backend is never
throttled), anonymous traffic is bucketed per IP with a tight cap — the
per-IP path is only reachable behind auth, so its policy is unit-tested
on the key/limit functions directly.

These tests use a stubbed retrieval pipeline (see conftest.py) so they
don't need Qdrant + Gemini.
"""
from __future__ import annotations

from .conftest import TEST_RAG_KEY


def test_trusted_backend_is_not_rate_limited(client):
    """The shared-key bucket must never bite at interactive volumes —
    35 calls would trip the old 30/minute per-IP limit."""
    payload = {"query": "iman", "top_k": 3}
    statuses = [client.post("/api/search", json=payload).status_code for _ in range(35)]
    assert all(s == 200 for s in statuses), f"Unexpected statuses: {set(statuses)}"


def test_missing_token_is_401(anon_client):
    r = anon_client.post("/api/search", json={"query": "iman", "top_k": 3})
    assert r.status_code == 401


def test_wrong_token_is_401_not_500(anon_client):
    r = anon_client.post(
        "/api/search",
        json={"query": "iman", "top_k": 3},
        headers={"Authorization": "Bearer wrong-key"},
    )
    assert r.status_code == 401
    r = anon_client.post(
        "/tools/list_works", json={}, headers={"X-API-Key": "wrong-key"}
    )
    assert r.status_code == 401


def test_missing_rag_api_key_fails_closed(keyless_app):
    """With RAG_API_KEY unset every route must refuse to serve (503) —
    never silently go public (the old fail-open landmine)."""
    from fastapi.testclient import TestClient

    with TestClient(keyless_app) as c:
        r = c.post("/api/search", json={"query": "iman", "top_k": 3})
        assert r.status_code == 503
        r = c.post("/tools/list_works", json={})
        assert r.status_code == 503
        # Health stays reachable even then (it may 503 for its own
        # reasons — Qdrant down — but never because of the auth gate,
        # and never 401).
        assert c.get("/api/health").status_code != 401


def test_health_endpoint_public_and_never_rate_limited(anon_client):
    """Health checks must always pass without credentials — they don't go
    through auth or the limiter."""
    for _ in range(50):
        r = anon_client.get("/api/health")
        # The health endpoint may legitimately 503 if Qdrant isn't
        # reachable, but it must NEVER 429 or 401.
        assert r.status_code not in (401, 429)


def test_options_preflight_bypasses_auth(anon_client):
    """CORS preflights carry no Authorization header; they must reach
    CORSMiddleware instead of dying with a header-less 401."""
    r = anon_client.options(
        "/api/search",
        headers={
            "Origin": "https://hizmetsearch.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "https://hizmetsearch.com"


def test_search_returns_stub_results(client):
    r = client.post("/api/search", json={"query": "iman", "top_k": 3})
    assert r.status_code == 200
    body = r.json()
    assert body["query"] == "iman"
    assert body["result_count"] == 3
    assert len(body["results"]) == 3
    assert body["results"][0]["chunk"]["title"] == "Stub Source"


# ── Unit tests for the rate-key / limit policy ────────────────────────────


def _fake_request(headers: dict[str, str], client_ip: str = "203.0.113.7"):
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/search",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_ip, 4242),
        "query_string": b"",
    }
    return Request(scope)


def test_rate_key_buckets(app, monkeypatch):
    """`app` fixture sets RAG_API_KEY=TEST_RAG_KEY and reimports app.*."""
    from app.ratelimit import TRUSTED_BUCKET, rate_key

    trusted = _fake_request({"Authorization": f"Bearer {TEST_RAG_KEY}"})
    assert rate_key(trusted) == TRUSTED_BUCKET
    trusted_x = _fake_request({"X-API-Key": TEST_RAG_KEY})
    assert rate_key(trusted_x) == TRUSTED_BUCKET
    anon = _fake_request({}, client_ip="198.51.100.9")
    assert rate_key(anon) == "198.51.100.9"
    wrong = _fake_request({"Authorization": "Bearer nope"}, client_ip="198.51.100.9")
    assert rate_key(wrong) == "198.51.100.9"


def test_search_limit_policy(app):
    from app.ratelimit import TRUSTED_BUCKET, search_rate_limit

    assert search_rate_limit(TRUSTED_BUCKET) == "2000/minute"
    assert search_rate_limit("198.51.100.9") == "30/minute"


def test_token_compare_rejects_empty(app):
    from app.ratelimit import token_matches

    assert not token_matches("", "")
    assert not token_matches("x", "")
    assert not token_matches("", "x")
    assert token_matches("abc", "abc")
    # Non-ASCII input must not raise (compare_digest on bytes).
    assert not token_matches("İı", "abc")
