import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../users";

export const add = mutation({
  args: {
    query: v.string(),
    resultCount: v.number(),
    mode: v.union(v.literal("results"), v.literal("ai_answer")),
    /** Optional cached payload from the most recent run, so clicking
     *  this history row in the future can restore results instantly
     *  without re-fetching. Caller is responsible for keeping the
     *  JSON small (we cap at 200 KB defensively). */
    cachedResultsJson: v.optional(v.string()),
    cachedAiAnswer: v.optional(v.string()),
    cachedExpansions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    // Defensive size cap. Convex docs are limited to 1 MiB total; we
    // don't want a bloated result snapshot to crash the write.
    const MAX_CACHE_BYTES = 200_000;
    const safeCache =
      args.cachedResultsJson && args.cachedResultsJson.length <= MAX_CACHE_BYTES
        ? args.cachedResultsJson
        : undefined;
    const cacheFields = {
      cachedResultsJson: safeCache,
      cachedAiAnswer: args.cachedAiAnswer,
      cachedExpansions: args.cachedExpansions,
    };

    if (!user) {
      // Anonymous searches still need a row but we don't dedupe them
      // (no userId to scope by).
      return await ctx.db.insert("searchHistory", {
        query: args.query,
        resultCount: args.resultCount,
        mode: args.mode,
        ...cacheFields,
        createdAt: Date.now(),
      });
    }

    // Dedupe by (user, query) ONLY. Switching between Sources and AI
    // Answer for the same query patches the same row instead of
    // creating a new entry — the user thinks of it as "the same
    // search, just a different view." Filter changes likewise update
    // in place. The `mode` field on the row tracks the most recent
    // view they were on so we can restore it on click.
    const existing = await ctx.db
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("query"), args.query))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        resultCount: args.resultCount,
        mode: args.mode,
        // Only refresh the cache when we actually have one — partial
        // calls (e.g. AI-mode upgrade) shouldn't blank out the cache
        // from the previous run.
        ...(safeCache ? { cachedResultsJson: safeCache } : {}),
        ...(args.cachedAiAnswer ? { cachedAiAnswer: args.cachedAiAnswer } : {}),
        ...(args.cachedExpansions
          ? { cachedExpansions: args.cachedExpansions }
          : {}),
        createdAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("searchHistory", {
      userId: user._id,
      query: args.query,
      resultCount: args.resultCount,
      mode: args.mode,
      ...cacheFields,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("searchHistory") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== user._id) return;
    await ctx.db.delete(args.id);
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const rows = await ctx.db
      .query("searchHistory")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  },
});
