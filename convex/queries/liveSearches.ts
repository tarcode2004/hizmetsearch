// cache-bust 1
/**
 * Reactive subscription to a live search row.
 *
 * The search page calls this with the id returned by
 * `mutations.liveSearches.start`. As the internal action patches the
 * row through its pipeline milestones, every subscriber receives the
 * updated state — that's how we get progressive rendering without
 * native action streaming.
 *
 * Auth: rows owned by an authenticated user are only readable by
 * that user. Rows created by anonymous sessions are world-readable
 * by id (the id itself is the secret token, and rows are short-lived).
 */
import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../users";

export const get = query({
  args: { id: v.id("liveSearches") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    if (row.userId) {
      const user = await getCurrentUser(ctx);
      if (!user || user._id !== row.userId) return null;
    }
    return row;
  },
});

/**
 * Auth-bypassing version of `get`, callable only from server-side
 * code (internal actions, internal mutations, crons). The public
 * `get` query above enforces ownership via `getCurrentUser(ctx)`,
 * which returns null for scheduler-invoked internal actions because
 * they don't carry an auth identity. The synthesize action — which
 * runs over a row whose ownership was already validated by the
 * `requestAiAnswer` mutation that scheduled it — uses this query
 * instead so it can actually read the row's resultsJson.
 *
 * Do NOT expose this from a client-facing query. The auth check on
 * the public `get` is the only thing keeping a stranger from reading
 * another user's search row by guessing the id.
 */
export const getInternal = internalQuery({
  args: { id: v.id("liveSearches") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
