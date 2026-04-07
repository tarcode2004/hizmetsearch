import { mutation } from "../_generated/server";
import { v } from "convex/values";

/** Log a user activity event. */
export const log = mutation({
  args: {
    userId: v.optional(v.id("users")),
    sessionId: v.string(),
    action: v.string(),
    metadata: v.optional(v.string()),
    page: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("activityLog", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/** Batch log multiple events (for buffered client-side logging). */
export const logBatch = mutation({
  args: {
    events: v.array(
      v.object({
        userId: v.optional(v.id("users")),
        sessionId: v.string(),
        action: v.string(),
        metadata: v.optional(v.string()),
        page: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const event of args.events) {
      await ctx.db.insert("activityLog", {
        ...event,
        createdAt: now,
      });
    }
  },
});
