/**
 * Server-side token-budget gate for `actions/chat.sendMessage`.
 *
 * Pure and dependency-free so it can be unit-tested (vitest) without a
 * Convex runtime. The caller resolves the FAMILY-SPECIFIC BYOK key first
 * and skips this gate entirely only when the user has an active key for
 * the family that will actually execute — a Gemini-only BYOK key must
 * never bypass the Claude budget checks (that was the A2 bypass: any
 * active key skipped every check, then the loop fell back to the
 * platform ANTHROPIC_API_KEY).
 */
import {
  DAILY_LIMITS,
  ESTIMATED_RESEARCH_ANSWER_TOKENS,
} from "./planLimits";

export interface BudgetSubscription {
  plan: string;
  claudeTokensUsed: number;
  geminiTokensUsed: number;
  claudeTokensLimit: number;
  geminiTokensLimit: number;
  claudeCreditTokens?: number;
  geminiCreditTokens?: number;
  claudeTokensToday?: number;
  geminiTokensToday?: number;
  dayResetAt?: number;
}

/**
 * Decide whether a send must be refused for budget reasons.
 *
 * @returns a user-facing error message when the send must be refused,
 *          or null when it may proceed.
 */
export function budgetRefusal(opts: {
  /** The user's subscription row (null/undefined skips all checks —
   *  no subscription means nothing to enforce against). */
  sub: BudgetSubscription | null | undefined;
  /** The model family that will actually execute (deep research is
   *  always "claude" regardless of the selected family). */
  family: "claude" | "gemini";
  /** Deep-research mode — adds the ~90K pre-flight check. */
  agentic: boolean;
  now?: number;
}): string | null {
  const { sub, family, agentic } = opts;
  if (!sub) return null;
  const now = opts.now ?? Date.now();

  const isClaude = family === "claude";
  const used = isClaude ? sub.claudeTokensUsed : sub.geminiTokensUsed;
  const limit = isClaude ? sub.claudeTokensLimit : sub.geminiTokensLimit;
  const credit = isClaude
    ? sub.claudeCreditTokens ?? 0
    : sub.geminiCreditTokens ?? 0;

  if (used >= limit && credit <= 0) {
    return `Token budget exhausted for ${family}. Upgrade your plan, buy a credit pack, or add your own API key in Settings.`;
  }

  // Deep research pre-flight: one answer costs ~90K billing-equivalent
  // tokens. Refuse up front when the remaining monthly allotment (plus
  // credits) can't cover it, instead of starting a 60s research run
  // that would massively overdraw the budget.
  if (agentic) {
    const remainingMonthly = Math.max(0, limit - used) + credit;
    if (remainingMonthly < ESTIMATED_RESEARCH_ANSWER_TOKENS) {
      return `Not enough Claude tokens left for a deep research answer (needs ~${Math.round(ESTIMATED_RESEARCH_ANSWER_TOKENS / 1000)}K, ${Math.round(remainingMonthly / 1000)}K remaining). Upgrade your plan, buy a credit pack, or add your own Anthropic API key in Settings.`;
    }
  }

  // Enforce daily cap as well — protects against runaway scripts
  // draining the monthly allotment in one bad day.
  const dailyCap = DAILY_LIMITS[sub.plan as keyof typeof DAILY_LIMITS];
  if (dailyCap) {
    const todayUsed = isClaude
      ? sub.claudeTokensToday ?? 0
      : sub.geminiTokensToday ?? 0;
    const dayCap = isClaude ? dailyCap.claude : dailyCap.gemini;
    const dayResetAt = sub.dayResetAt ?? 0;
    // Only enforce if we're inside the current day window — when the
    // window has rolled over the trackUsage mutation will reset the
    // counter on the next call.
    if (now < dayResetAt && todayUsed >= dayCap && credit <= 0) {
      return `Daily token cap reached for ${family}. Resets in a few hours, or buy a credit pack / use your own API key.`;
    }
  }

  return null;
}
