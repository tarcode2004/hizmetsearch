/**
 * Analytics facade — wraps PostHog so the rest of the app stays decoupled
 * from the SDK. Every existing call site (`trackPageView`, `trackEvent`,
 * `trackSearch`, `trackFeedback`, `trackChatMessage`) keeps working;
 * additional helpers below are new.
 *
 * Configuration
 * -------------
 * Set both vars in `web/.env.local` (or your Netlify env) to enable:
 *   VITE_POSTHOG_KEY  = phc_...   (project API key — publishable, ships in browsers)
 *   VITE_POSTHOG_HOST = https://us.posthog.com  (or https://eu.posthog.com)
 *
 * If either is missing the SDK is left uninitialized and every call below
 * becomes a no-op. This means dev / demo mode produces zero network noise
 * and you can run the app without ever signing up for PostHog.
 *
 * Where to track what
 * -------------------
 * - **Visitor / product events** (this file) — page views, searches, chat
 *   sends, upgrade clicks, plan switches, anything funnel-shaped
 * - **App-internal joinable metrics** (`convex/mutations/activity.ts`) —
 *   things that need a database join (e.g. "average sources clicked per
 *   pro user per chat"). Don't duplicate visitor events here.
 * - **Errors** — `lib/observability.ts` (Sentry)
 * - **Revenue** — Stripe Dashboard / Sigma (don't recreate revenue
 *   analytics in PostHog; Stripe is canonical)
 */
import posthog from "posthog-js";

// ── Init ────────────────────────────────────────────────────────────────

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.posthog.com";

let initialized = false;

/** Idempotent. Safe to call multiple times — only the first call boots the SDK. */
export function initAnalytics() {
  if (initialized || !POSTHOG_KEY || typeof window === "undefined") return;
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // We track route changes manually via `trackPageView`. Disabling the
      // built-in autocapture pageview hook prevents double-counting.
      capture_pageview: false,
      capture_pageleave: true,
      // Cookieless mode — uses localStorage only, no third-party cookies.
      // Trade-off: cross-subdomain tracking won't carry across, but we don't
      // have subdomains.
      persistence: "localStorage+cookie",
      // Don't capture form fields or input values — protects search query
      // privacy and avoids leaking BYOK API keys via the Settings form.
      autocapture: {
        dom_event_allowlist: ["click"],
        element_allowlist: ["a", "button"],
      },
      // PostHog session replay is opt-in via dashboard; defaults are off.
      loaded: () => {
        initialized = true;
      },
    });
    initialized = true;
    // Expose the SDK instance on window for easy debugging from devtools.
    // Newer posthog-js versions don't auto-attach. The SDK still works
    // either way — this just makes it inspectable.
    (window as unknown as { posthog: typeof posthog }).posthog = posthog;
  } catch (err) {
    // Analytics must never break the app.
    console.warn("PostHog init failed:", err);
  }
}

/** Identify the current user across sessions. Call after Clerk hydrates. */
export function identifyUser(user: {
  id: string;
  email?: string;
  name?: string;
  plan?: string;
}) {
  if (!initialized) return;
  try {
    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
      plan: user.plan,
    });
  } catch {
    /* swallow — analytics must never break the app */
  }
}

/** Clear identity on sign-out so the next visitor isn't attributed to them. */
export function resetIdentity() {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    /* swallow */
  }
}

// ── Event vocabulary ────────────────────────────────────────────────────

type EventName =
  | "search"
  | "search_ai_answer"
  | "chat_message_sent"
  | "chat_model_switch"
  | "voice_session_start"
  | "voice_session_end"
  | "feedback_thumbs_up"
  | "feedback_thumbs_down"
  | "feedback_text_submitted"
  | "byok_key_added"
  | "byok_toggled"
  | "plan_upgrade_click"
  | "plan_checkout_start"
  | "plan_changed"
  | "credit_pack_purchase_click"
  | "share_link_created"
  | "conversation_deleted"
  | "page_view";

interface EventParams {
  [key: string]: string | number | boolean | undefined | null;
}

/** Generic event capture. Use the higher-level helpers below where possible. */
export function trackEvent(name: EventName, params?: EventParams) {
  if (!initialized) return;
  try {
    posthog.capture(name, params ?? {});
  } catch {
    /* swallow */
  }
}

// ── High-level helpers (keep existing call sites untouched) ────────────

export function trackPageView(path: string, title?: string) {
  if (!initialized) return;
  try {
    posthog.capture("$pageview", {
      $current_url: typeof window !== "undefined" ? window.location.href : path,
      page_path: path,
      page_title: title,
    });
  } catch {
    /* swallow */
  }
}

export function trackSearch(
  query: string,
  resultCount: number,
  mode: "results" | "ai"
) {
  trackEvent(mode === "ai" ? "search_ai_answer" : "search", {
    // PostHog convention: prefix with $ for protected names. We use plain
    // names so the data stays simple in the dashboard.
    search_term: query,
    result_count: resultCount,
    mode,
  });
}

export function trackFeedback(
  type: "thumbs_up" | "thumbs_down",
  context: "search_result" | "ai_answer" | "chat_message",
  itemId?: string
) {
  trackEvent(
    type === "thumbs_up" ? "feedback_thumbs_up" : "feedback_thumbs_down",
    {
      feedback_context: context,
      item_id: itemId,
    }
  );
}

export function trackChatMessage(
  model: string,
  variant?: string,
  hasVoice: boolean = false
) {
  trackEvent("chat_message_sent", { model, variant, voice: hasVoice });
}

export function trackChatModelSwitch(
  fromModel: string,
  toModel: string,
  variant?: string
) {
  trackEvent("chat_model_switch", {
    from_model: fromModel,
    to_model: toModel,
    variant,
  });
}

// ── New helpers for the funnel ─────────────────────────────────────────

export function trackUpgradeClick(plan: "pro" | "scholar") {
  trackEvent("plan_upgrade_click", { plan });
}

export function trackCheckoutStart(plan: "pro" | "scholar") {
  trackEvent("plan_checkout_start", { plan });
}

export function trackPlanChanged(
  fromPlan: string | undefined,
  toPlan: string,
  source: "stripe_webhook" | "manual"
) {
  trackEvent("plan_changed", { from_plan: fromPlan, to_plan: toPlan, source });
}

export function trackCreditPackClick(packId: "spark" | "lantern" | "minaret") {
  trackEvent("credit_pack_purchase_click", { pack_id: packId });
}

export function trackShareLinkCreated(conversationId: string) {
  trackEvent("share_link_created", { conversation_id: conversationId });
}

export function trackConversationDeleted(conversationId: string) {
  trackEvent("conversation_deleted", { conversation_id: conversationId });
}

export function trackByokKeyAdded(provider: "gemini" | "claude") {
  trackEvent("byok_key_added", { provider });
}

export function trackByokToggled(active: boolean) {
  trackEvent("byok_toggled", { active });
}
