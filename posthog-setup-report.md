<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the HizmetSearch FastAPI backend. A `Posthog()` client instance is initialized in a lifespan context manager on startup (`api/app/main.py`) and stored on `app.state.posthog` so all route handlers can access it without global state. The client is registered with `atexit` and explicitly shut down on lifespan exit to guarantee all events are flushed before process exit. Environment variables (`POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`) are written to `api/.env` and referenced at startup; `posthog` is already present in the Dockerfile `pip install` line so the package is available in the Docker image. `enable_exception_autocapture=True` is set on the client to automatically capture uncaught exceptions.

Four server-side events are instrumented across three files:

| Event | Description | File |
|-------|-------------|------|
| `search_performed` | Fired on every successful search. Properties: `query_length`, `result_count`, `retrieval_time_ms`, `language`, `category`, `use_reranker`. | `api/app/routes/search.py` |
| `search_failed` | Fired when the retrieval pipeline raises an exception. Also calls `capture_exception()` for full stack-trace error tracking. Properties: `query_length`, `language`, `category`, `error_type`. | `api/app/routes/search.py` |
| `api_health_degraded` | Fired when the Qdrant vector store is unreachable during a health check. Properties: `collection_name`, `error_type`. | `api/app/routes/health.py` |
| `api_unauthorized_access` | Fired when a request presents an invalid or missing API key (HTTP 401). Property: `path`. | `api/app/main.py` |

Server-side events use the `X-PostHog-Distinct-ID` request header when present (forwarded by the Convex backend) so events correlate with client-side sessions. When the header is absent, a stable server-side sentinel ID (`hizmetsearch-api-server`) is used.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://us.posthog.com/project/374797/dashboard/1446609
- **Search volume over time:** https://us.posthog.com/project/374797/insights/kLmIBTKy
- **Search success vs failure:** https://us.posthog.com/project/374797/insights/IoP4Twzi
- **Searches by category:** https://us.posthog.com/project/374797/insights/0y2U0e8A
- **Average search retrieval time (ms):** https://us.posthog.com/project/374797/insights/V0mfpWIB
- **API security & health incidents:** https://us.posthog.com/project/374797/insights/N1rYabco

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-fastapi/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
