import { mutation } from "../_generated/server";
import { v } from "convex/values";

/** Submit a thumbs up/down rating. */
export const submitRating = mutation({
  args: {
    userId: v.optional(v.id("users")),
    targetType: v.union(
      v.literal("search_result"),
      v.literal("ai_answer"),
      v.literal("chat_message")
    ),
    targetId: v.string(),
    rating: v.union(v.literal("up"), v.literal("down")),
    query: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already rated this target
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_target", (q) => q.eq("targetId", args.targetId))
      .filter((q) =>
        args.userId
          ? q.eq(q.field("userId"), args.userId)
          : q.eq(q.field("userId"), undefined)
      )
      .first();

    if (existing) {
      // Update existing rating
      await ctx.db.patch(existing._id, { rating: args.rating });
      return existing._id;
    }

    return await ctx.db.insert("feedback", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/** Submit text feedback comment on an existing rating. */
export const submitComment = mutation({
  args: {
    feedbackId: v.id("feedback"),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.feedbackId, { comment: args.comment });
  },
});

/** Get user's rating for a specific target. */
export const getUserRating = mutation({
  args: {
    userId: v.optional(v.id("users")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.userId) return null;
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_target", (q) => q.eq("targetId", args.targetId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
    return existing?.rating ?? null;
  },
});
