import { query } from "../_generated/server";
import { v } from "convex/values";

export const byUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isArchived", false)
      )
      .order("desc")
      .collect();
  },
});
