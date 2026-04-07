import { query } from "../_generated/server";
import { v } from "convex/values";

/** Get current subscription + usage for a user. */
export const getUsage = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!sub) {
      return {
        plan: "free" as const,
        claudeTokensUsed: 0,
        geminiTokensUsed: 0,
        claudeTokensLimit: 20_000,
        geminiTokensLimit: 100_000,
        claudePercentUsed: 0,
        geminiPercentUsed: 0,
        isExceeded: false,
        resetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        hasByokKeys: false,
        byokActive: false,
      };
    }

    const hasByokKeys = !!(keys?.geminiKeySet || keys?.claudeKeySet);
    const byokActive = !!(keys?.isActive && hasByokKeys);

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
      claudePercentUsed: Math.round(claudePercent),
      geminiPercentUsed: Math.round(geminiPercent),
      isExceeded: !byokActive && claudeExceeded && geminiExceeded,
      resetAt: sub.resetAt,
      hasByokKeys,
      byokActive,
      stripeCustomerId: sub.stripeCustomerId,
    };
  },
});
