import { mutation } from "../_generated/server";
import { v } from "convex/values";

/** Save or update user's BYOK API keys. */
export const saveKeys = mutation({
  args: {
    userId: v.id("users"),
    geminiKey: v.optional(v.string()),
    claudeKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const data = {
      geminiKey: args.geminiKey ?? existing?.geminiKey,
      claudeKey: args.claudeKey ?? existing?.claudeKey,
      geminiKeySet: !!(args.geminiKey || existing?.geminiKey),
      claudeKeySet: !!(args.claudeKey || existing?.claudeKey),
      isActive: true,
      lastValidated: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("apiKeys", { userId: args.userId, ...data });
    }
  },
});

/** Remove a specific key. */
export const removeKey = mutation({
  args: {
    userId: v.id("users"),
    provider: v.union(v.literal("gemini"), v.literal("claude")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!existing) return;

    if (args.provider === "gemini") {
      await ctx.db.patch(existing._id, {
        geminiKey: undefined,
        geminiKeySet: false,
        isActive: existing.claudeKeySet,
      });
    } else {
      await ctx.db.patch(existing._id, {
        claudeKey: undefined,
        claudeKeySet: false,
        isActive: existing.geminiKeySet,
      });
    }
  },
});

/** Toggle BYOK active/inactive. */
export const toggleByok = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!existing) return;
    await ctx.db.patch(existing._id, { isActive: args.isActive });
  },
});
