/**
 * Feedback mutations.
 *
 * `submitRating` and `submitComment` derive the userId from the auth
 * identity (not from a client arg), so a malicious client cannot spoof
 * ratings on behalf of another user. Anonymous users may also submit
 * feedback (the row is stored with `userId = undefined`).
 */
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../users";

export const submitRating = mutation({
  args: {
    targetType: v.union(
      v.literal("search_result"),
      v.literal("ai_answer"),
      v.literal("chat_message")
    ),
    targetId: v.string(),
    rating: v.union(v.literal("up"), v.literal("down")),
    query: v.optional(v.string()),
    model: v.optional(v.string()),
    // Training-data context — see schema.ts for details on each field.
    matchedQuery: v.optional(v.string()),
    expandedQueries: v.optional(v.array(v.string())),
    chunkSnapshot: v.optional(
      v.object({
        chunk_id: v.string(),
        doc_id: v.optional(v.string()),
        title: v.optional(v.string()),
        author_speaker: v.optional(v.string()),
        collection: v.optional(v.string()),
        text_excerpt: v.optional(v.string()),
        page_number: v.optional(v.number()),
        score: v.optional(v.number()),
        rerank_score: v.optional(v.number()),
        language: v.optional(v.string()),
      })
    ),
    filterLanguage: v.optional(v.string()),
    filterCategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const userId = user?._id;

    // De-dupe: one rating per (user, target). Anonymous users get one
    // shared bucket per target since we have no identity.
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_target", (q) => q.eq("targetId", args.targetId))
      .filter((q) =>
        userId
          ? q.eq(q.field("userId"), userId)
          : q.eq(q.field("userId"), undefined)
      )
      .first();

    // Cap the expanded-query list at 5 to keep individual rows small.
    const cappedExpansions = args.expandedQueries?.slice(0, 5);

    const trainingFields = {
      matchedQuery: args.matchedQuery,
      expandedQueries: cappedExpansions,
      chunkSnapshot: args.chunkSnapshot,
      filterLanguage: args.filterLanguage,
      filterCategory: args.filterCategory,
    };

    if (existing) {
      // Patch the rating AND refresh the training-data context — the
      // user might have re-rated after switching filters or after
      // additional expansions ran.
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        ...trainingFields,
      });
      return existing._id;
    }

    return await ctx.db.insert("feedback", {
      userId,
      targetType: args.targetType,
      targetId: args.targetId,
      rating: args.rating,
      query: args.query,
      model: args.model,
      ...trainingFields,
      createdAt: Date.now(),
    });
  },
});

export const submitComment = mutation({
  args: {
    feedbackId: v.id("feedback"),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const row = await ctx.db.get(args.feedbackId);
    if (!row) return;
    // Only the original rater can attach a comment to their feedback.
    if (row.userId && row.userId !== user?._id) return;
    await ctx.db.patch(args.feedbackId, { comment: args.comment });
  },
});
