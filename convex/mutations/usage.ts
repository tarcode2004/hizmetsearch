import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Per-model token limits per plan.
 *
 * Pricing reference (April 2026):
 *   Claude Opus 4.6:  $5 in / $25 out per 1M  → ~$19/1M blended (30/70)
 *   Gemini 3.1 Pro:   $2 in / $12 out per 1M  → ~$9/1M blended
 *
 * Cost ceilings at max usage:
 *   Free    : 20K Claude ($0.38) / 100K Gemini ($0.90)
 *   Pro     : 200K Claude ($3.80) / 1M Gemini ($9.00)  — $9.99 plan
 *   Scholar : 1M Claude ($19.00) / 5M Gemini ($45.00) — $24.99 plan
 */
export const PLAN_LIMITS: Record<
  string,
  { claude: number; gemini: number }
> = {
  free: { claude: 20_000, gemini: 100_000 },
  pro: { claude: 200_000, gemini: 1_000_000 },
  scholar: { claude: 1_000_000, gemini: 5_000_000 },
};

/** Create initial subscription for new user (free tier). */
export const initSubscription = mutation({
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
      resetAt: nextMonth,
    });
  },
});

/** Increment token usage after a query/chat for a specific model. */
export const trackUsage = mutation({
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
    const isClaude = args.model === "claude";

    // Auto-reset if past reset date
    if (now >= sub.resetAt) {
      await ctx.db.patch(sub._id, {
        claudeTokensUsed: isClaude ? args.tokensConsumed : 0,
        geminiTokensUsed: isClaude ? 0 : args.tokensConsumed,
        resetAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    } else {
      await ctx.db.patch(sub._id, {
        claudeTokensUsed: isClaude
          ? sub.claudeTokensUsed + args.tokensConsumed
          : sub.claudeTokensUsed,
        geminiTokensUsed: isClaude
          ? sub.geminiTokensUsed
          : sub.geminiTokensUsed + args.tokensConsumed,
      });
    }
  },
});

/** Upgrade plan (called after Stripe webhook confirms payment). */
export const upgradePlan = mutation({
  args: {
    userId: v.id("users"),
    plan: v.union(v.literal("pro"), v.literal("scholar")),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const limits = PLAN_LIMITS[args.plan];
    const data = {
      plan: args.plan,
      status: "active" as const,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      currentPeriodEnd: args.currentPeriodEnd,
      claudeTokensLimit: limits.claude,
      geminiTokensLimit: limits.gemini,
    };

    if (sub) {
      await ctx.db.patch(sub._id, data);
    } else {
      const now = Date.now();
      await ctx.db.insert("subscriptions", {
        userId: args.userId,
        ...data,
        claudeTokensUsed: 0,
        geminiTokensUsed: 0,
        resetAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    }
  },
});

/** Cancel subscription (downgrade to free). */
export const cancelPlan = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!sub) return;

    await ctx.db.patch(sub._id, {
      plan: "free",
      status: "canceled",
      claudeTokensLimit: PLAN_LIMITS.free.claude,
      geminiTokensLimit: PLAN_LIMITS.free.gemini,
    });
  },
});
