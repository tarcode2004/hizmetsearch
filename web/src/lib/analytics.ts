/**
 * Google Analytics 4 event tracking helpers.
 *
 * Replace G-XXXXXXXXXX in index.html with your actual GA4 Measurement ID.
 * All events are typed for consistency and autocomplete.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

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
  | "page_view";

interface EventParams {
  [key: string]: string | number | boolean | undefined;
}

export function trackEvent(name: EventName, params?: EventParams) {
  try {
    window.gtag?.("event", name, {
      ...params,
      timestamp: Date.now(),
    });
  } catch {
    // Silently fail if GA not loaded
  }
}

export function trackPageView(path: string, title?: string) {
  try {
    window.gtag?.("event", "page_view", {
      page_path: path,
      page_title: title,
    });
  } catch {
    // Silently fail
  }
}

export function trackSearch(query: string, resultCount: number, mode: "results" | "ai") {
  trackEvent(mode === "ai" ? "search_ai_answer" : "search", {
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
  trackEvent(type === "thumbs_up" ? "feedback_thumbs_up" : "feedback_thumbs_down", {
    feedback_context: context,
    item_id: itemId,
  });
}

export function trackChatMessage(model: string, hasVoice: boolean = false) {
  trackEvent("chat_message_sent", { model, voice: hasVoice });
}
