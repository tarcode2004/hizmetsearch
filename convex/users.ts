/**
 * User identity helpers — bridge between Clerk JWT identity and Convex user rows.
 */
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { PLAN_LIMITS } from "./lib/planLimits";

/**
 * Resolve the Clerk-authenticated identity to a Convex `users` row.
 * Returns null if the request is unauthenticated.
 */
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

/** Returns the current user + their subscription, or null if unauthenticated. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    const apiKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      image: user.image,
      subscription,
      hasByokKeys: !!(apiKeys?.geminiKeySet || apiKeys?.claudeKeySet),
      byokActive: !!(apiKeys?.isActive && (apiKeys?.geminiKeySet || apiKeys?.claudeKeySet)),
    };
  },
});

/**
 * Idempotently insert/update a user from the current Clerk identity.
 * Called by the web client on first sign-in.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      // Refresh stale profile fields if Clerk has newer values
      if (
        existing.email !== identity.email ||
        existing.name !== identity.name ||
        existing.image !== identity.pictureUrl
      ) {
        await ctx.db.patch(existing._id, {
          email: identity.email ?? existing.email,
          name: identity.name ?? existing.name,
          image: identity.pictureUrl ?? existing.image,
        });
      }
      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email ?? "",
      name: identity.name,
      image: identity.pictureUrl,
    });

    // Create initial free-tier subscription. `unique()` above is racy under
    // concurrent first-load, so guard against double-insert by checking
    // for an existing row before inserting.
    const existingSub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!existingSub) {
      const now = Date.now();
      const nextMonth = now + 30 * 24 * 60 * 60 * 1000;
      await ctx.db.insert("subscriptions", {
        userId,
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
    }

    return userId;
  },
});
