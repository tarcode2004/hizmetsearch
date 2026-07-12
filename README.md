# HizmetSearch

Semantic search and AI-powered exploration of Islamic scholarship.

Search, chat, and discover connections across **Risale-i Nur**, **Hizmet** works, and related sources — in Turkish, Arabic, and English.

## Features

- **Semantic search** — Hybrid dense + sparse + reranking pipeline across ~50K chunks
- **AI answers** — Perplexity-style synthesized responses with inline citations
- **Chat mode** — Conversational research with two AI models:
  - **Gemini 3.1 Pro** (Exploration) — Broader theological connections
  - **Claude Opus 4.6** (Precision) — Citation-grounded, low hallucination
- **Search history** — Cached results with rerun capability
- **Multilingual UI** — Turkish and English
- **Dark mode** + fully responsive mobile layout
- **Bring Your Own Key (BYOK)** — Use your own Gemini/Claude API keys for unlimited usage
- **Stripe-ready billing** — Free/Pro/Scholar tiers with per-model token tracking

## Tech Stack

| Layer | Tech |
|------|------|
| Frontend | React 19 + Vite + Tailwind 4 + shadcn/ui patterns |
| Backend state | Convex (chat history, auth, real-time streaming) |
| RAG API | FastAPI wrapping existing `hizmetrag` Python pipeline |
| Vector DB | Qdrant (local or Qdrant Cloud) |
| Embeddings | Google Gemini Embedding 2 (3072-d) + BM25 sparse |
| Deployment | Netlify (web) + Railway (API) + Convex Cloud |

## Monorepo Structure

```
hizmetsearch/
├── web/          # React + Vite frontend
├── api/          # FastAPI wrapper for the RAG pipeline
├── convex/       # Convex backend (schema, mutations, actions)
└── packages/     # Shared TypeScript types
```

## Development

```bash
# Install web dependencies
cd web && pnpm install

# Start dev server
pnpm dev
```

Open <http://localhost:5173>.

## Plans

Claude usage is metered in **billing-equivalent tokens**: prompt-cache
reads count at 0.1x and cache writes at 1.25x face value, matching how
Anthropic bills them. One deep-research answer costs ~95K
billing-equivalent tokens (~186K face-value input, ~99.99% cached).

| Plan | Price | Claude tokens | ≈ deep research answers | Gemini tokens |
|------|-------|---------------|-------------------------|---------------|
| Anonymous | $0 | — | — | 5K/mo |
| Free | $0 | 400K/mo | ~4/mo | 100K/mo |
| Pro | $9.99/mo | 6M/mo | 60+/mo | 1M/mo |
| Scholar | $24.99/mo | 30M/mo | 300+/mo | 5M/mo |

Bring your own Gemini or Claude API key to remove all limits on any plan.

## License

TBD — community project.
