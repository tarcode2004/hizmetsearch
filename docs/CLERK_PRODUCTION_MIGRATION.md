# Clerk: dev instance → production instance

This walks you through promoting your Clerk **development** instance to a
**production** instance so you can:

- Use a custom domain (e.g. `clerk.hizmetsearch.com` or auth on your apex)
- Get rid of the `Clerk has been loaded with development keys` console
  warning
- Take real users through sign-up without the strict dev limits (≤ 100
  users, no email/SMS to arbitrary recipients)

## Before you start

- This is a **one-way transition** for the dev instance: when you create
  a production instance, the dev instance keeps existing alongside it,
  but you'll have **two separate sets of users**. Anyone who signed up
  on the dev instance will need to sign up again on production. For us
  this is fine — you and a couple of test accounts are the only existing
  users.
- The production instance gets new keys (`pk_live_…`, `sk_live_…`) and
  a new JWT issuer URL. Every place that references the dev keys
  (`pk_test_c21vb3RoLXBhbmdvbGluLTAuY2xlcmsuYWNjb3VudHMuZGV2JA` and
  `https://smooth-pangolin-0.clerk.accounts.dev`) needs to be updated.
- You'll need a custom domain you control (e.g. `hizmetsearch.com`) to
  set up production. Subdomains are fine.

---

## 1. Create the production instance in Clerk

1. Open https://dashboard.clerk.com → your HizmetSearch app
2. Top-left, find the dropdown that currently says **"Development"** —
   click it
3. Click **"Create production instance"**
4. Confirm — Clerk creates a fresh instance attached to the same app
5. The dropdown now shows **"Production"** mode

You're now editing the production instance. The dev instance still
exists and stays unchanged.

## 2. Add your domain

1. With **"Production"** selected in the top-left dropdown
2. **Configure → Domains**
3. Click **+ Add domain**
4. Enter your apex domain: `hizmetsearch.com`
5. Clerk will give you DNS records to add — typically:
   - `CNAME clerk.hizmetsearch.com → frontend-api.clerk.services` (or similar)
   - `CNAME accounts.hizmetsearch.com → accounts.clerk.services`
   - Possibly `TXT` records for verification
6. Add those records in **Cloudflare** (or whoever runs your DNS).
   Cloudflare propagation is usually < 1 minute.
7. Back in Clerk, click **Verify** for each record
8. Once all records are green, Clerk provisions the production frontend
   API at `https://clerk.hizmetsearch.com` (or the subdomain you chose)

## 3. Re-enable sign-in methods on the production instance

Production instances start with a clean configuration. Redo the sign-in
options:

1. **Configure → Email, phone, username** → enable Email + Password (or
   whatever combo you used in dev)
2. **Configure → Social connections** → enable Google (and any others)
3. **Configure → User & authentication → Email, phone, username** →
   tweak required vs optional fields if needed
4. **Customization → Branding** → upload your logo + brand color
   (optional, makes the modal look like your app)

## 4. Re-create the JWT template named "convex"

Critical: Clerk does NOT carry over JWT templates from dev to prod.
Without this template, sign-in works in the modal but `ctx.auth.getUserIdentity()` returns `null` server-side and Convex thinks every request is anonymous.

1. **Configure → JWT Templates**
2. Click **+ New template**
3. Pick the **"Convex"** preset from the list
4. Name must remain exactly `convex` (lowercase)
5. Save
6. Click into the new template → copy the **Issuer** URL — it'll look
   like `https://clerk.hizmetsearch.com` (note: NOT the
   `*.clerk.accounts.dev` form anymore — production uses your real
   domain)

## 5. Get the production API keys

1. **Configure → API Keys**
2. Under **Standard keys**:
   - Copy the **Publishable key** — starts with `pk_live_…`
   - You do NOT need the secret key for our setup
3. Save both somewhere safe locally (1Password, your notes, etc).
   These are different from the dev keys you've been using.

## 6. Update Convex (both dev and prod deployments)

The new issuer URL needs to land in `CLERK_JWT_ISSUER_DOMAIN` on every
Convex deployment. Run from your terminal:

```bash
cd "/Volumes/T7 Shield/HizmetRAG/hizmetsearch/convex"

# Production deployment — primary target
CONVEX_DEPLOYMENT=prod:insightful-corgi-987 \
  npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://clerk.hizmetsearch.com"

# Dev deployment — keep in sync so localhost testing still works
CONVEX_DEPLOYMENT=dev:unique-chipmunk-902 \
  npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://clerk.hizmetsearch.com"
```

Replace `https://clerk.hizmetsearch.com` with the **exact** Issuer URL
Clerk gave you in step 4.

Then re-deploy so the auth config picks up the change:

```bash
CONVEX_DEPLOYMENT=prod:insightful-corgi-987 npx convex deploy --yes
```

## 7. Update the web app's publishable key

Two places:

### Local `.env.local`

Edit `hizmetsearch/web/.env.local`:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_<YOUR_NEW_KEY>
```

Restart vite if it's running locally.

### Netlify env

```bash
cd "/Volumes/T7 Shield/HizmetRAG/hizmetsearch/web"
netlify env:set VITE_CLERK_PUBLISHABLE_KEY "pk_live_<YOUR_NEW_KEY>"
```

Or via the Netlify dashboard: **Site configuration → Environment
variables → VITE_CLERK_PUBLISHABLE_KEY → Edit → Save**.

## 8. Rebuild and redeploy the web app

Manual deploys (which is how this site ships) bake the env var into the
JS bundle at build time, so you need a fresh build:

```bash
cd "/Volumes/T7 Shield/HizmetRAG/hizmetsearch/web"
pnpm build
netlify deploy --prod --no-build --dir="$(pwd)/dist"
```

Wait for the deploy to finish (~30 seconds).

## 9. Verify

1. Open https://hizmetsearch.com in an **incognito window** (so you
   start fresh — your dev session cookies don't carry over)
2. Hard refresh (Cmd+Shift+R)
3. Open dev tools → Console
4. The `Clerk has been loaded with development keys` warning should be
   GONE
5. Click **Sign In** in the header
6. The Clerk modal should:
   - Show your custom branding (if you set it up in step 3)
   - Be served from your custom domain (network tab → look at the
     requests to `clerk.hizmetsearch.com` instead of `*.clerk.accounts.dev`)
7. Sign up with a new email or your Google account
8. After sign-in, check the Convex dashboard → `users` table → there
   should be a new row with your identity. The `tokenIdentifier` field
   should now contain your custom domain instead of
   `smooth-pangolin-0.clerk.accounts.dev`.
9. Send a chat message → confirm the chat works end-to-end (the action
   `me` query should resolve since the JWT is now valid against the
   production issuer)

## 10. (Optional) Disable the dev instance

Once production works end-to-end:

- Clerk dashboard → top-left dropdown → **Development**
- **Configure → Settings → Danger zone → Pause instance** (or delete it
  entirely if you have no test accounts you want to preserve)

This prevents anyone from accidentally signing in to the dev instance
in the future. Your `dev:unique-chipmunk-902` Convex deployment will
still work for development since it uses the same production issuer URL
now (per step 6).

---

## Common pitfalls

### "Clerk has been loaded with development keys" still appears

→ The browser is loading a cached JS bundle. Hard refresh (Cmd+Shift+R)
or open in incognito.

### Convex `users.me` returns null after sign-in

→ JWT issuer mismatch. Open dev tools → Network tab → find the
WebSocket connection to `*.convex.cloud` → check the auth payload. If
it shows your old `smooth-pangolin-0.clerk.accounts.dev` issuer, the
web is still using the old publishable key. Re-build + re-deploy.

### "Invalid host" error from Clerk on the modal

→ The custom domain DNS records haven't fully propagated, or the
"convex" JWT template wasn't created on the production instance. Step 4.

### Sign-in modal opens but immediately errors

→ The publishable key in the JS bundle doesn't match the Clerk
production instance. Check the bundle:
```bash
curl -sL "https://hizmetsearch.com/" | grep -oE 'assets/index-[^"]*\.js' | head -1 | xargs -I {} curl -sL "https://hizmetsearch.com/{}" | grep -c "pk_live_"
```
Should print `1` after a fresh deploy.

### Existing test accounts can't sign in

→ Production instance has its own user database. Anyone who signed up
on the dev instance has to sign up again on production. There is no
migration tool — Clerk treats them as separate apps.

---

## Rollback

If anything goes wrong and you need to roll back to dev for an hour:

1. `web/.env.local` → set `VITE_CLERK_PUBLISHABLE_KEY` back to the
   `pk_test_…` value
2. `netlify env:set VITE_CLERK_PUBLISHABLE_KEY "pk_test_..."`
3. `convex env set CLERK_JWT_ISSUER_DOMAIN "https://smooth-pangolin-0.clerk.accounts.dev" --prod`
4. `pnpm build && netlify deploy --prod --no-build --dir="$(pwd)/dist"`
5. Re-deploy convex prod

The dev instance is unchanged, so this is fully reversible until you
explicitly delete it in step 10.
