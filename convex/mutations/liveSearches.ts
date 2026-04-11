// cache-bust 1
/**
 * Mutations for the streaming/progressive search row.
 *
 * The public `start` mutation creates a `liveSearches` row in
 * `pending` state and schedules the internal `runLiveSearch` action
 * to populate it. Returns the row id immediately so the client can
 * subscribe via `useQuery(api.queries.liveSearches.get, {id})` and
 * watch results land progressively.
 *
 * `patch` is the workhorse the action calls at each pipeline
 * milestone — it's an `internalMutation` so a malicious client can't
 * inject fake results into another user's row.
 */
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getCurrentUser } from "../users";

const STATUS = v.union(
  v.literal("pending"),
  v.literal("expanding"),
  v.literal("retrieving"),
  v.literal("ranked"),
  v.literal("highlighting"),
  v.literal("synthesizing"),
  v.literal("done"),
  v.literal("error"),
);

export const start = mutation({
  args: {
    query: v.string(),
    mode: v.union(v.literal("results"), v.literal("ai_answer")),
    language: v.optional(v.string()),
    category: v.optional(
      v.union(
        v.literal("risale"),
        v.literal("risale_dersleri"),
        v.literal("pirlanta"),
        v.literal("hizmet"),
      ),
    ),
  },
  handler: async (ctx, args): Promise<Id<"liveSearches">> => {
    const user = await getCurrentUser(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("liveSearches", {
      userId: user?._id,
      query: args.query,
      mode: args.mode,
      language: args.language,
      category: args.category,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    // Fire-and-forget the heavy retrieval action. Scheduling at
    // delay 0 means it runs in the next event loop tick after this
    // mutation commits, which is what lets us return the id to the
    // client BEFORE the search has actually started.
    await ctx.scheduler.runAfter(0, internal.actions.liveSearch.run, {
      id,
      query: args.query,
      mode: args.mode,
      language: args.language,
      category: args.category,
    });
    return id;
  },
});

export const patch = internalMutation({
  args: {
    id: v.id("liveSearches"),
    status: v.optional(STATUS),
    resultsJson: v.optional(v.string()),
    aiAnswer: v.optional(v.string()),
    expansions: v.optional(v.array(v.string())),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const filtered: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v_] of Object.entries(fields)) {
      if (v_ !== undefined) filtered[k] = v_;
    }
    await ctx.db.patch(id, filtered);
  },
});

/**
 * Run only the AI synthesis pass on an existing liveSearches row.
 *
 * Used when the user toggles search mode from "results" to "AI Answer"
 * on a query they already searched — we have the ranked + highlighted
 * chunks already, so re-running the retrieval pipeline would just burn
 * latency for the same answer. Instead we patch the row's status to
 * `synthesizing`, schedule the internal action that runs only the
 * synthesis pass, and let the frontend's existing useQuery subscription
 * pick up the answer when it lands.
 *
 * No-op if the row already has an aiAnswer (idempotent — re-toggling
 * AI mode shouldn't burn another LLM call).
 *
 * Auth: only the row's owner can request synthesis. Anonymous rows are
 * world-readable by id but we still gate the mutation behind ownership
 * to keep one anonymous user from burning another's quota.
 */
export const requestAiAnswer = mutation({
  args: { id: v.id("liveSearches") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Search row not found");
    if (row.userId) {
      const user = await getCurrentUser(ctx);
      if (!user || user._id !== row.userId) {
        throw new Error("Not authorized");
      }
    }
    if (row.aiAnswer) {
      // Already synthesized — nothing to do.
      return { alreadyHadAnswer: true };
    }
    if (!row.resultsJson) {
      throw new Error("Row has no results yet — wait for retrieval to finish");
    }
    await ctx.db.patch(args.id, {
      status: "synthesizing",
      mode: "ai_answer",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.actions.liveSearch.synthesize, {
      id: args.id,
    });
    return { alreadyHadAnswer: false };
  },
});

/** Periodic cleanup of stale liveSearches rows. Called by cron. */
export const cleanupStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 30 * 60 * 1000; // 30 minutes
    const stale = await ctx.db
      .query("liveSearches")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
      .take(200);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return { deleted: stale.length };
  },
});
