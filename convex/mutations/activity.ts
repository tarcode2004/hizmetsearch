/**
 * App-internal activity log.
 *
 * **Use this for**: things that need a database join to be useful — e.g.
 * "average sources clicked per pro user per chat", "which Risale-i Nur
 * sections are most-cited in successful chat answers", per-doc or per-chunk
 * analytics that depend on Convex state.
 *
 * **Do NOT use this for**: page views, search counts, chat sends, upgrade
 * clicks, or anything else that's plain visitor/funnel analytics. Those go
 * through PostHog (`web/src/lib/analytics.ts`). Duplicating them here just
 * pollutes the table without giving you anything PostHog can't already
 * answer.
 */
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
