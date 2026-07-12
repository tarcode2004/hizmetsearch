/**
 * Per-model pricing for cost reporting in `$ai_total_cost_usd`.
 *
 * Rates are per **1 million tokens** in USD, separated for input and output.
 * Sources:
 *   - Claude:  https://platform.claude.com/docs/en/about-claude/pricing
 *   - Gemini:  https://ai.google.dev/pricing
 *
 * Last verified: 2026-04-08. Update when providers change rates.
 *
 * Returns `0` for unknown models so PostHog still receives the event with
 * a valid `$ai_total_cost_usd: 0` rather than NaN/missing — better to
 * undercount cost than to drop the row from the dashboard entirely.
 */

interface ModelPrice {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
}

const PRICING: Record<string, ModelPrice> = {
  // ── Anthropic Claude ─────────────────────────────────────────
  // Sonnet 5 — research agent loop model. Full (non-intro) price so
  // the cost model stays correct after the intro window ends 2026-08-31.
  "claude-sonnet-5": { input: 3, output: 15 },
  // Current 4.6 generation
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },

  // Legacy Claude (still supported)
  "claude-opus-4-5-20251101": { input: 5, output: 25 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },

  // ── Google Gemini ────────────────────────────────────────────
  // 2.5 stable
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini-2.5-flash-lite": { input: 0.075, output: 0.3 },
  // 3.x preview — pricing TBD, mark as 0 so we don't double-count
  "gemini-3.1-pro-preview": { input: 0, output: 0 },
  "gemini-3-flash-preview": { input: 0, output: 0 },
  "gemini-3.1-flash-lite-preview": { input: 0, output: 0 },
};

/** Compute the USD cost of a single LLM call. Unknown models → 0. */
export function computeLLMCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const price = PRICING[modelId];
  if (!price) return 0;
  const inputCost = (inputTokens / 1_000_000) * price.input;
  const outputCost = (outputTokens / 1_000_000) * price.output;
  // Round to 6 decimals so PostHog renders nice numbers in the UI
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/** Map a model id to its provider — used as the `$ai_provider` event property. */
export function modelProvider(modelId: string): "anthropic" | "google" | "unknown" {
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gemini")) return "google";
  return "unknown";
}
