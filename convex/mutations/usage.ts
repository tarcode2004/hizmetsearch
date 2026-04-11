/**
 * Token-usage and subscription bookkeeping.
 *
 * `trackUsage` is internal — only the chat / search actions may call it,
 * never the client. Plan upgrades + cancels are handled by the Stripe
 * webhook handler in `convex/http.ts` via the internal mutations in
 * `convex/billing.ts`.
 */
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { PLAN_LIMITS } from "../lib/planLimits";

/** Re-exported for convenience; canonical definition is in lib/planLimits.ts. */
export { PLAN_LIMITS };

/** Create the initial free-tier subscription for a brand-new user. */
export const initSubscription = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    const nextMonth = now + 30 * 24 * 60 * 60 * 1000;
    return await ctx.db.insert("subscriptions", {
      userId: args.userId,
      plan: "free",
      status: "active",
      currentPeriodEnd: nextMonth,
      claudeTokensUsed: 0,
      geminiTokensUsed: 0,
      claudeTokensLimit: PLAN_LIMITS.free.claude,
      geminiTokensLimit: PLAN_LIMITS.free.gemini,
      claudeCreditTokens: 0,
      geminiCreditTokens: 0,
      payAsYouGoEnabled: false,
      resetAt: nextMonth,
    });
  },
});

/**
 * Increment token usage after a query/chat for a specific model.
 *
 * Credit-pack tokens are consumed first; only when those are exhausted do
 * we draw down the monthly allotment. Auto-resets the monthly counters
 * once the resetAt timestamp is reached.
 */
export const trackUsage = internalMutation({
  args: {
    userId: v.id("users"),
    model: v.union(v.literal("claude"), v.literal("gemini")),
    tokensConsumed: v.number(),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!sub) return;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const isClaude = args.model === "claude";

    // Auto-reset monthly counters if past resetAt
    let claudeUsed = sub.claudeTokensUsed;
    let geminiUsed = sub.geminiTokensUsed;
    let resetAt = sub.resetAt;
    if (now >= sub.resetAt) {
      claudeUsed = 0;
      geminiUsed = 0;
      resetAt = now + 30 * ONE_DAY;
    }

    // Auto-reset daily counters if past dayResetAt
    let claudeToday = sub.claudeTokensToday ?? 0;
    let geminiToday = sub.geminiTokensToday ?? 0;
    let dayResetAt = sub.dayResetAt ?? 0;
    if (now >= dayResetAt) {
      claudeToday = 0;
      geminiToday = 0;
      dayResetAt = now + ONE_DAY;
    }

    // Drain credit pack first (does NOT count against the daily cap —
    // credits are pre-paid)
    let claudeCredit = sub.claudeCreditTokens ?? 0;
    let geminiCredit = sub.geminiCreditTokens ?? 0;
    let remaining = args.tokensConsumed;
    if (isClaude && claudeCredit > 0) {
      const drawn = Math.min(claudeCredit, remaining);
      claudeCredit -= drawn;
      remaining -= drawn;
    } else if (!isClaude && geminiCredit > 0) {
      const drawn = Math.min(geminiCredit, remaining);
      geminiCredit -= drawn;
      remaining -= drawn;
    }

    // Apply remainder to monthly + daily allotments
    if (isClaude) {
      claudeUsed += remaining;
      claudeToday += remaining;
    } else {
      geminiUsed += remaining;
      geminiToday += remaining;
    }

    await ctx.db.patch(sub._id, {
      claudeTokensUsed: claudeUsed,
      geminiTokensUsed: geminiUsed,
      claudeCreditTokens: claudeCredit,
      geminiCreditTokens: geminiCredit,
      claudeTokensToday: claudeToday,
      geminiTokensToday: geminiToday,
      dayResetAt,
      resetAt,
    });
  },
});
