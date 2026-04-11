/**
 * Internal helpers for resolving the per-user "bring your own key" API key.
 *
 * `getActiveKey` is an internal query so the raw key value is never exposed
 * to the client — only Convex actions running server-side may call it.
 */
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { decryptSecret } from "./lib/secretCipher";

/**
 * Resolve the per-user BYOK API key for a given model. The DB stores
 * the key in AES-GCM envelope form (`v1:iv:ct`), so we decrypt
 * just-in-time here. Legacy plaintext rows (no `v1:` prefix) are
 * tolerated for backward compatibility with anything written before
 * encryption shipped.
 */
export const getActiveKey = internalQuery({
  args: {
    userId: v.id("users"),
    model: v.union(v.literal("claude"), v.literal("gemini")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row || !row.isActive) return null;
    const stored =
      args.model === "claude"
        ? row.claudeKeySet
          ? row.claudeKey
          : null
        : row.geminiKeySet
          ? row.geminiKey
          : null;
    return await decryptSecret(stored);
  },
});
