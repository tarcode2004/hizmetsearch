/**
 * Internal billing mutations — invoked from the Stripe webhook handler.
 *
 * Mutations here are `internal` so they cannot be called directly from the
 * web client; they trust the data passed in because it has already been
 * verified by the webhook signature check in http.ts.
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { PLAN_LIMITS } from "./lib/planLimits";

const CREDIT_PACK_TOKENS: Record<
  string,
  { claude: number; gemini: number }
> = {
  spark: { claude: 100_000, gemini: 500_000 },
  lantern: { claude: 400_000, gemini: 2_000_000 },
  minaret: { claude: 2_000_000, gemini: 10_000_000 },
};

const STATUS_MAP: Record<
  string,
  "active" | "canceled" | "past_due" | "trialing" | "incomplete"
> = {
  active: "active",
  canceled: "canceled",
  past_due: "past_due",
  trialing: "trialing",
  incomplete: "incomplete",
  incomplete_expired: "incomplete",
  unpaid: "past_due",
  paused: "past_due",
};

/** Insert or update a subscription row from Stripe state. */
export const syncSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    plan: v.union(v.literal("pro"), v.literal("scholar")),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: v.string(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const limits = PLAN_LIMITS[args.plan];
    const status = STATUS_MAP[args.status] ?? "incomplete";

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        plan: args.plan,
        status,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        currentPeriodEnd: args.currentPeriodEnd,
        claudeTokensLimit: limits.claude,
        geminiTokensLimit: limits.gemini,
      });
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("subscriptions", {
      userId: args.userId,
      plan: args.plan,
      status,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      currentPeriodEnd: args.currentPeriodEnd,
      claudeTokensUsed: 0,
      geminiTokensUsed: 0,
      claudeTokensLimit: limits.claude,
      geminiTokensLimit: limits.gemini,
      claudeCreditTokens: 0,
      geminiCreditTokens: 0,
      payAsYouGoEnabled: false,
      resetAt: now + 30 * 24 * 60 * 60 * 1000,
    });
  },
});

/** Apply a credit pack purchase to a user. */
export const applyCreditPack = internalMutation({
  args: {
    userId: v.id("users"),
    packId: v.string(),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const pack = CREDIT_PACK_TOKENS[args.packId];
    if (!pack) throw new Error(`Unknown credit pack: ${args.packId}`);

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (sub) {
      await ctx.db.patch(sub._id, {
        claudeCreditTokens: (sub.claudeCreditTokens ?? 0) + pack.claude,
        geminiCreditTokens: (sub.geminiCreditTokens ?? 0) + pack.gemini,
        stripeCustomerId: args.stripeCustomerId,
      });
      return sub._id;
    }

    const now = Date.now();
    return await ctx.db.insert("subscriptions", {
      userId: args.userId,
      plan: "free",
      status: "active",
      stripeCustomerId: args.stripeCustomerId,
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
      claudeTokensUsed: 0,
      geminiTokensUsed: 0,
      claudeTokensLimit: PLAN_LIMITS.free.claude,
      geminiTokensLimit: PLAN_LIMITS.free.gemini,
      claudeCreditTokens: pack.claude,
      geminiCreditTokens: pack.gemini,
      payAsYouGoEnabled: false,
      resetAt: now + 30 * 24 * 60 * 60 * 1000,
    });
  },
});

/** Cancel a subscription by Stripe subscription id (downgrade to free). */
export const cancelByStripeSubscription = internalMutation({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
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

/** Mark a subscription as past_due (called on invoice.payment_failed). */
export const markPastDue = internalMutation({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();
    if (!sub) return;
    await ctx.db.patch(sub._id, { status: "past_due" });
  },
});
