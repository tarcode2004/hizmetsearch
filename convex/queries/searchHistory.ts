import { query } from "../_generated/server";
import { getCurrentUser } from "../users";

/** List the current user's most recent searches (newest first, capped at 50). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});
