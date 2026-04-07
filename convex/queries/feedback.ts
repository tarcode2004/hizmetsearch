import { query } from "../_generated/server";
import { v } from "convex/values";

/** Get feedback stats for a target (total ups, total downs). */
export const getStats = query({
  args: { targetId: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("feedback")
      .withIndex("by_target", (q) => q.eq("targetId", args.targetId))
      .collect();

    return {
      ups: all.filter((f) => f.rating === "up").length,
      downs: all.filter((f) => f.rating === "down").length,
      total: all.length,
      comments: all.filter((f) => f.comment).map((f) => ({
        comment: f.comment!,
        rating: f.rating,
        createdAt: f.createdAt,
      })),
    };
  },
});

/** Get recent feedback across all targets (for admin dashboard). */
export const getRecent = query({
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
    let q = ctx.db.query("feedback");

    if (args.targetType) {
      q = q.withIndex("by_type", (idx) => idx.eq("targetType", args.targetType!));
    }

    return await q
      .order("desc")
      .take(args.limit ?? 50);
  },
});
