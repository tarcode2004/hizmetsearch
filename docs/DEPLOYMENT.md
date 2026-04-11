# HizmetSearch Deployment Runbook

End-to-end commands for shipping HizmetSearch to production. Follow the
phases in order — each one is self-contained and verifiable.

## Architecture summary

```
Browser ──▶ Netlify (web app)
   │           │
   │           ├─ Clerk (auth)
   │           └─ Convex Cloud
   │                │
   │                ├─ FastAPI on Fly.io ──▶ Qdrant Cloud
   │                ├─ Anthropic / Gemini APIs
   │                └─ Stripe (subscriptions + credit packs)
   │
   └─ Cloudflare R2 (source files: PDFs, audio, video)
```

## Phase 0 — Accounts & secrets

Sign up and gather credentials for:

| Service          | What you need                                          |
|------------------|--------------------------------------------------------|
| Qdrant Cloud     | Cluster URL + API key                                  |
| Google AI Studio | `GEMINI_API_KEY` (production)                          |
| Anthropic        | `ANTHROPIC_API_KEY`                                    |
| Cloudflare       | R2 bucket + public URL + DNS for your domain           |
| Convex           | `npx convex login`                                     |
| Clerk            | Application + JWT template named `convex`              |
| Stripe           | Account + 2 recurring + 3 one-time products            |
| Fly.io           | Account + `flyctl auth login`                          |
| Netlify          | Already configured via `netlify.toml`                  |

## Phase 1 — Migrate Qdrant to the cloud

The corpus is already indexed in your local docker volume (~34 GB).
Snapshot → upload → verify.

```bash
# 1. Snapshot the local collection
docker compose up -d qdrant
curl -X POST "http://localhost:6333/collections/hizmet_rag/snapshots"
# Note the filename printed in the response.

# 2. Upload to Qdrant Cloud
curl -X PUT \
  "https://YOUR-CLUSTER.qdrant.io/collections/hizmet_rag/snapshots/upload?priority=snapshot" \
  -H "api-key: $QDRANT_API_KEY" \
  -F "snapshot=@data/qdrant_storage/collections/hizmet_rag/snapshots/hizmet_rag-XXX.snapshot"

# 3. Verify by pointing the local pipeline at the cloud
QDRANT_URL=https://YOUR-CLUSTER.qdrant.io \
QDRANT_API_KEY=... \
python scripts/query.py
```

## Phase 2 — Upload source files to R2

```bash
# rclone config: choose "s3", provider "Cloudflare R2", endpoint
# https://<account-id>.r2.cloudflarestorage.com

rclone copy "Sources/" r2:hizmetsearch-sources/ \
    --transfers=8 --checkers=16 --progress

# Backfill source_url into Qdrant payloads
QDRANT_URL=https://YOUR-CLUSTER.qdrant.io \
QDRANT_API_KEY=... \
python scripts/backfill_source_urls.py \
    --r2-base-url https://sources.hizmetsearch.com \
    --dry-run --limit 50

# When the dry-run output looks correct, drop --dry-run and re-run.
```

Configure CORS on the R2 bucket so the browser can fetch directly:

```json
[{
  "AllowedOrigins": ["https://hizmetsearch.com", "https://*.netlify.app"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 86400
}]
```

## Phase 3 — Deploy FastAPI to Fly.io

```bash
cd hizmetsearch/api

fly launch --no-deploy --copy-config       # first time only

fly secrets set \
  GEMINI_API_KEY="..." \
  QDRANT_URL="https://YOUR-CLUSTER.qdrant.io" \
  QDRANT_API_KEY="..." \
  RAG_API_KEY="$(openssl rand -hex 32)"   # save this; Convex needs it

# IMPORTANT: the Dockerfile copies both `src/hizmetrag` (the Python
# pipeline) and `hizmetsearch/api/app` (the FastAPI app), so the build
# context must be the repo root:
fly deploy --dockerfile Dockerfile --build-context ../..

# Smoke test
curl https://hizmetsearch-api.fly.dev/api/health
curl -X POST https://hizmetsearch-api.fly.dev/api/search \
  -H "X-API-Key: <your RAG_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"query":"namaz","top_k":3}'
```

## Phase 4 — Set up Clerk

1. Clerk dashboard → **Create application**.
2. **JWT Templates → New template → "convex"** (use Clerk's preset).
3. Copy the issuer URL.
4. Add your Netlify domain to **Allowed origins**.

## Phase 5 — Deploy Convex

```bash
cd hizmetsearch/convex

npx convex login                # one-time
npx convex deploy --prod        # creates production deployment

# Set every env var (see hizmetsearch/convex/.env.example for the full list):
npx convex env set RAG_API_URL="https://hizmetsearch-api.fly.dev" --prod
npx convex env set RAG_API_KEY="<same value as Fly>" --prod
npx convex env set ANTHROPIC_API_KEY="..." --prod
npx convex env set GEMINI_API_KEY="..." --prod
npx convex env set CLERK_JWT_ISSUER_DOMAIN="https://your-app.clerk.accounts.dev" --prod
npx convex env set STRIPE_SECRET_KEY="sk_live_..." --prod
npx convex env set STRIPE_PRO_PRICE_ID="price_..." --prod
npx convex env set STRIPE_SCHOLAR_PRICE_ID="price_..." --prod
npx convex env set STRIPE_PACK_SPARK_PRICE_ID="price_..." --prod
npx convex env set STRIPE_PACK_LANTERN_PRICE_ID="price_..." --prod
npx convex env set STRIPE_PACK_MINARET_PRICE_ID="price_..." --prod
npx convex env set STRIPE_WEBHOOK_SECRET="whsec_..." --prod  # set after Phase 6

# Re-deploy so functions pick up the new env
npx convex deploy --prod
```

The first deploy will overwrite the `_generated/` stub directory with real
codegen output.

## Phase 6 — Configure Stripe

1. **Products** → create:
   - "HizmetSearch Pro" recurring $9.99 / month
   - "HizmetSearch Scholar" recurring $24.99 / month
   - "Spark Credit Pack" one-time $5
   - "Lantern Credit Pack" one-time $15
   - "Minaret Credit Pack" one-time $50
2. Copy each price id (`price_…`) into the Convex env vars (Phase 5).
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-DEPLOYMENT.convex.site/stripe/webhook`
   - Events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy the signing secret → `npx convex env set STRIPE_WEBHOOK_SECRET=...`
4. Test with Stripe CLI:
   ```bash
   stripe listen --forward-to https://YOUR-DEPLOYMENT.convex.site/stripe/webhook
   stripe trigger checkout.session.completed
   ```

## Phase 7 — Deploy the web app to Netlify

1. Push to your main branch (Netlify auto-deploys via `netlify.toml`).
2. **Site settings → Environment variables**, add:
   - `VITE_CONVEX_URL=https://YOUR-DEPLOYMENT.convex.cloud`
   - `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...`
3. Trigger a fresh deploy (the env vars are baked in at build time).

## Phase 8 — DNS & domain

Point your domain at Cloudflare (recommended). DNS records:

| Type   | Name      | Target                       | Proxy |
|--------|-----------|------------------------------|-------|
| CNAME  | @         | `your-site.netlify.app`      | ✅    |
| CNAME  | api       | `hizmetsearch-api.fly.dev`   | DNS only — Fly does its own TLS |
| CNAME  | sources   | R2 public hostname           | ✅    |

After DNS propagates, update:
- FastAPI CORS allowlist in `hizmetsearch/api/app/main.py`
- Clerk allowed origins
- Stripe webhook URL (if Convex domain changed)

## Phase 9 — Smoke tests

1. Anonymous user: search → results stream from Qdrant via FastAPI.
2. Sign up via Clerk → check Convex dashboard for new `users` row + `subscriptions` row at free tier.
3. Open chat → send a message → Anthropic / Gemini streams a response with footnote citations.
4. Click a citation → in-page right preview opens; "Open in viewer" loads the PDF from R2 with the chunk highlighted.
5. Click "Upgrade to Pro" → Stripe Checkout → success → webhook fires → reload, plan should now read "pro".
6. Buy a credit pack → one-time Checkout → webhook fires → token allowance increases.
7. Add a personal Anthropic key in Settings → next chat message bypasses the platform key.

## Estimated monthly cost (low traffic)

| Item                                    | Cost           |
|-----------------------------------------|----------------|
| Qdrant Cloud (smallest fits 34 GB)      | ~$50           |
| Fly.io FastAPI (1× shared-cpu-1x, 1 GB) | ~$3            |
| Convex (free tier)                       | $0             |
| Clerk (≤ 10K MAU)                        | $0             |
| R2 storage (~5 GB)                       | ~$0.10         |
| Netlify (free tier)                      | $0             |
| Stripe                                   | 2.9% + $0.30/txn |
| LLM API usage                            | variable       |
| **Fixed total**                          | **~$53/mo**    |
