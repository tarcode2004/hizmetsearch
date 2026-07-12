/**
 * Single source of truth for per-plan token limits, plus the
 * billing-equivalent weighting used when charging usage against quotas.
 *
 * ── Billing-equivalent accounting (July 2026) ─────────────────────────
 * The deep-research loop (Claude Sonnet 5, prompt caching on) reads the
 * same prefix every round, so face-value input tokens wildly overstate
 * cost: Anthropic bills cache reads at 0.1× and cache writes at 1.25×
 * the base input rate. Quotas therefore charge *billing-equivalent*
 * tokens (see `billingEquivalentTokens`), while analytics keep the raw
 * face-value numbers.
 *
 * Measured reference answer (T4 verification, dev deployment):
 *   face input 186,886 (cache reads ~124.8K, cache writes ~62.0K,
 *   uncached ~0.1K) + output 4,876
 *   → billing-equivalent ≈ 0.1×124.8K + 1.25×62.0K + 0.1K + 4.9K ≈ 95K
 *   → ≈ $0.34 at full (non-intro) Sonnet 5 pricing ($3/M in, $15/M out).
 *
 * ── Plan budgets (Claude, billing-equivalent tokens) ──────────────────
 *   Free    :   400K ≈ 4 deep answers/mo  (~$1.4 cost ceiling)
 *   Pro     :     6M ≈ 63 deep answers/mo  ($9.99 plan)
 *   Scholar :    30M ≈ 315 deep answers/mo ($24.99 plan)
 * Plain chat (uncached, ~5-10K tokens/message) got strictly cheaper for
 * every tier relative to the old 20K/200K/1M budgets.
 * Gemini budgets are unchanged (Gemini has no agentic mode).
 */
export const PLAN_LIMITS = {
  free: { claude: 400_000, gemini: 100_000 },
  pro: { claude: 6_000_000, gemini: 1_000_000 },
  scholar: { claude: 30_000_000, gemini: 5_000_000 },
} as const;

/**
 * Per-day soft cap. Stops a single bad day from draining the entire
 * monthly allotment in one runaway script. Claude daily caps are sized
 * so every tier can run at least one deep-research answer (~95K
 * billing-equivalent tokens) per day.
 */
export const DAILY_LIMITS = {
  free: { claude: 100_000, gemini: 25_000 },
  pro: { claude: 600_000, gemini: 200_000 },
  scholar: { claude: 3_000_000, gemini: 1_000_000 },
} as const;

/** Anthropic prompt-cache billing multipliers (vs the base input rate). */
export const CACHE_READ_WEIGHT = 0.1;
export const CACHE_WRITE_WEIGHT = 1.25;

/**
 * Pre-flight estimate for one deep-research answer, in billing-equivalent
 * tokens. Slightly below the measured ~95K so a user whose remaining
 * budget is "about one answer" isn't refused their last answer; small
 * overdraw on the final answer is acceptable.
 */
export const ESTIMATED_RESEARCH_ANSWER_TOKENS = 90_000;

/**
 * Convert raw per-call usage into billing-equivalent tokens for quota
 * accounting.
 *
 * `inputTokens` is the FACE-VALUE input total (uncached + cache reads +
 * cache writes — the research loop already sums it that way); the cache
 * split is subtracted back out and re-added at its billed weight. Output
 * tokens pass through at weight 1 (the token quota is an input-rate
 * quota; pricing differences between input and output are absorbed in
 * the plan sizing above). Analytics keep the raw numbers — only quota
 * charging uses this.
 */
export function billingEquivalentTokens(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}): number {
  const reads = Math.max(0, usage.cacheReadTokens ?? 0);
  const writes = Math.max(0, usage.cacheCreationTokens ?? 0);
  const uncachedInput = Math.max(0, usage.inputTokens - reads - writes);
  const equivalent =
    uncachedInput +
    reads * CACHE_READ_WEIGHT +
    writes * CACHE_WRITE_WEIGHT +
    Math.max(0, usage.outputTokens);
  return Math.round(equivalent);
}

export type PaidPlan = "pro" | "scholar";
export type Plan = "free" | PaidPlan;
