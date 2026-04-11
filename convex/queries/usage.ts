import { query } from "../_generated/server";
import { getCurrentUser } from "../users";

/** Get current subscription + usage for the authenticated user. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return {
        plan: "anonymous" as const,
        claudeTokensUsed: 0,
        geminiTokensUsed: 0,
        claudeTokensLimit: 0,
        geminiTokensLimit: 5_000,
        claudeCreditTokens: 0,
        geminiCreditTokens: 0,
        claudePercentUsed: 0,
        geminiPercentUsed: 0,
        isExceeded: false,
        resetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        hasByokKeys: false,
        byokActive: false,
      };
    }

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const geminiKeySet = !!keys?.geminiKeySet;
    const claudeKeySet = !!keys?.claudeKeySet;
    const hasByokKeys = geminiKeySet || claudeKeySet;
    const byokActive = !!(keys?.isActive && hasByokKeys);

    if (!sub) {
      return {
        plan: "free" as const,
        claudeTokensUsed: 0,
        geminiTokensUsed: 0,
        claudeTokensLimit: 20_000,
        geminiTokensLimit: 100_000,
        claudeCreditTokens: 0,
        geminiCreditTokens: 0,
        claudePercentUsed: 0,
        geminiPercentUsed: 0,
        isExceeded: false,
        resetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        hasByokKeys,
        byokActive,
        geminiKeySet,
        claudeKeySet,
      };
    }

    const claudePercent =
      sub.claudeTokensLimit > 0
        ? Math.min((sub.claudeTokensUsed / sub.claudeTokensLimit) * 100, 100)
        : 0;
    const geminiPercent =
      sub.geminiTokensLimit > 0
        ? Math.min((sub.geminiTokensUsed / sub.geminiTokensLimit) * 100, 100)
        : 0;

    const claudeExceeded = sub.claudeTokensUsed >= sub.claudeTokensLimit;
    const geminiExceeded = sub.geminiTokensUsed >= sub.geminiTokensLimit;

    return {
      plan: sub.plan,
      claudeTokensUsed: sub.claudeTokensUsed,
      geminiTokensUsed: sub.geminiTokensUsed,
      claudeTokensLimit: sub.claudeTokensLimit,
      geminiTokensLimit: sub.geminiTokensLimit,
      claudeCreditTokens: sub.claudeCreditTokens ?? 0,
      geminiCreditTokens: sub.geminiCreditTokens ?? 0,
      claudePercentUsed: Math.round(claudePercent),
      geminiPercentUsed: Math.round(geminiPercent),
      isExceeded: !byokActive && claudeExceeded && geminiExceeded,
      resetAt: sub.resetAt,
      hasByokKeys,
      byokActive,
      geminiKeySet,
      claudeKeySet,
      stripeCustomerId: sub.stripeCustomerId,
    };
  },
});
