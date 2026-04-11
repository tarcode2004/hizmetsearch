import { query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../users";

export const byConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== user._id) return [];
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();
  },
});
