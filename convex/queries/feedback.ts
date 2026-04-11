import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";

/** Get feedback stats for a target (total ups, total downs).
 *
 *  Bounded read — we cap at 500 rows per target. For higher-traffic targets
 *  this should be replaced with a denormalized counter (per Convex guidance:
 *  never use .collect().length for counts that grow unbounded).
 */
export const getStats = query({
  args: { targetId: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("feedback")
      .withIndex("by_target", (q) => q.eq("targetId", args.targetId))
      .take(500);

    let ups = 0;
    let downs = 0;
    const comments: Array<{
      comment: string;
      rating: "up" | "down";
      createdAt: number;
    }> = [];
    for (const f of all) {
      if (f.rating === "up") ups++;
      else downs++;
      if (f.comment) {
        comments.push({
          comment: f.comment,
          rating: f.rating,
          createdAt: f.createdAt,
        });
      }
    }
    return { ups, downs, total: all.length, comments };
  },
});

/**
 * Get recent feedback across all targets — admin/training-data export.
 *
 * SECURITY: This is an `internalQuery` (not a public `query`) because
 * it returns rows containing other users' `userId` along with their
 * comments and chunk snapshots. Exposing it on the public API surface
 * would let any signed-in client read every other user's feedback.
 *
 * Run from a trusted context only:
 *   npx convex run queries/feedback:getRecent --prod
 * or call from a server-side action that has its own auth check.
 */
export const getRecent = internalQuery({
  args: {
    limit: v.optional(v.number()),
    targetType: v.optional(
      v.union(
        v.literal("search_result"),
        v.literal("ai_answer"),
        v.literal("chat_message")
      )
    ),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const targetType = args.targetType;
    if (targetType) {
      return await ctx.db
        .query("feedback")
        .withIndex("by_type", (idx) => idx.eq("targetType", targetType))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("feedback").order("desc").take(limit);
  },
});

/**
 * The signed-in user's OWN recent feedback. Safe to expose publicly
 * because the userId scope is enforced server-side from auth.
 * Useful for a "your feedback history" panel later.
 */
export const myRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return [];
    return await ctx.db
      .query("feedback")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
