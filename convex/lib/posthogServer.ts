/**
 * Server-side PostHog client for use from Convex actions.
 *
 * Idempotent — `getPostHog()` returns a cached instance, so repeated
 * action invocations don't re-initialize the SDK or open new HTTP
 * connections. Returns `null` if `POSTHOG_API_KEY` isn't set, so calling
 * code can safely no-op:
 *
 *     const ph = getPostHog();
 *     if (ph) ph.capture({ ... });
 *
 * Required env vars (set on the Convex deployment):
 *   POSTHOG_API_KEY  — phc_...
 *   POSTHOG_HOST     — e.g. https://us.i.posthog.com (optional, defaults to US)
 *
 * "use node" is required because posthog-node transitively imports Node
 * built-ins (node:readline, node:fs) for its error-tracking source-maps
 * helper. Convex's V8 runtime bundler refuses any file that touches them.
 */
"use node";
import { PostHog } from "posthog-node";

let cached: PostHog | null = null;
let attemptedInit = false;

export function getPostHog(): PostHog | null {
  if (cached) return cached;
  if (attemptedInit) return null;
  attemptedInit = true;

  // Accept either var name. POSTHOG_API_KEY is the convention from PostHog's
  // Convex docs; POSTHOG_PROJECT_TOKEN is what we already set on the FastAPI
  // side. They hold the same `phc_…` value, so we let either one work and
  // the user only has to set one place per deployment.
  const apiKey =
    process.env.POSTHOG_API_KEY ?? process.env.POSTHOG_PROJECT_TOKEN;
  if (!apiKey) return null;

  const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";

  try {
    cached = new PostHog(apiKey, {
      host,
      // Tight flush settings for short-lived Convex action invocations.
      // Without these, events buffered in memory might be dropped when
      // the V8 isolate is recycled before the SDK's normal flush cadence.
      flushAt: 1, // flush every event immediately
      flushInterval: 0,
    });
    return cached;
  } catch (err) {
    console.warn("PostHog server init failed:", err);
    return null;
  }
}
