import { query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("conversations")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", user._id).eq("isArchived", false)
      )
      .order("desc")
      .collect();
  },
});

/**
 * Public read for shared conversations. Looks the conversation up by its
 * `shareToken` (no auth required) and returns it along with all of its
 * messages. Returns null if the token doesn't match anything — the caller
 * should treat that as "not found / link revoked".
 *
 * IMPORTANT: this is intentionally unauthenticated. Make sure no sensitive
 * fields are exposed beyond what we hand back here.
 */
export const getShared = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token || args.token.length < 8) return null;
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_share_token", (q) => q.eq("shareToken", args.token))
      .first();
    if (!conv || !conv.shareToken) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
      .collect();

    // Optionally hydrate the author's display name (if set on the row)
    const author = await ctx.db.get(conv.userId);

    return {
      conversation: {
        _id: conv._id,
        title: conv.title,
        model: conv.model,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      },
      messages: messages.map((m) => ({
        _id: m._id,
        role: m.role,
        content: m.content,
        model: m.model,
        sources: m.sources,
        createdAt: m.createdAt,
      })),
      author: author?.name ?? null,
    };
  },
});
