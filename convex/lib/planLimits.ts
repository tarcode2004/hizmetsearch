/**
 * Single source of truth for per-plan token limits.
 *
 * Pricing reference (April 2026):
 *   Claude Opus 4.6:  ~$19/1M blended (30/70 in/out)
 *   Gemini 3.1 Pro:   ~$9/1M blended
 *
 * Cost ceilings at max usage:
 *   Free    : 20K Claude ($0.38) / 100K Gemini ($0.90)
 *   Pro     : 200K Claude ($3.80) / 1M Gemini ($9.00)   — $9.99 plan
 *   Scholar : 1M Claude ($19.00)  / 5M Gemini ($45.00)  — $24.99 plan
 */
export const PLAN_LIMITS = {
  free: { claude: 20_000, gemini: 100_000 },
  pro: { claude: 200_000, gemini: 1_000_000 },
  scholar: { claude: 1_000_000, gemini: 5_000_000 },
} as const;

/**
 * Per-day soft cap. Stops a single bad day from draining the entire monthly
 * allotment in one runaway script. Roughly = monthly limit / 10 so a normal
 * user couldn't accidentally hit the daily cap.
 */
export const DAILY_LIMITS = {
  free: { claude: 5_000, gemini: 25_000 },
  pro: { claude: 40_000, gemini: 200_000 },
  scholar: { claude: 200_000, gemini: 1_000_000 },
} as const;

export type PaidPlan = "pro" | "scholar";
export type Plan = "free" | PaidPlan;
