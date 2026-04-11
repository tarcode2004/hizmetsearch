import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../users";
import { encryptSecret } from "../lib/secretCipher";

/**
 * Save or update the current user's BYOK API keys.
 *
 * Keys are envelope-encrypted with AES-GCM (see lib/secretCipher.ts)
 * before being written. The plaintext only ever exists in this
 * mutation's request scope and in the chat action that decrypts the
 * envelope just-in-time before calling Anthropic / Google. The DB
 * never sees plaintext after this point.
 */
export const saveKeys = mutation({
  args: {
    geminiKey: v.optional(v.string()),
    claudeKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    // Encrypt only the freshly-supplied keys; existing stored values
    // are already in envelope form and pass through unchanged.
    const encryptedGemini = args.geminiKey
      ? await encryptSecret(args.geminiKey)
      : existing?.geminiKey;
    const encryptedClaude = args.claudeKey
      ? await encryptSecret(args.claudeKey)
      : existing?.claudeKey;

    const data = {
      geminiKey: encryptedGemini,
      claudeKey: encryptedClaude,
      geminiKeySet: !!encryptedGemini,
      claudeKeySet: !!encryptedClaude,
      isActive: true,
      lastValidated: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("apiKeys", { userId: user._id, ...data });
    }
  },
});

/** Remove one of the stored keys for the current user. */
export const removeKey = mutation({
  args: {
    provider: v.union(v.literal("gemini"), v.literal("claude")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
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

/** Toggle BYOK on/off for the current user. */
export const toggleByok = mutation({
  args: { isActive: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!existing) return;
    await ctx.db.patch(existing._id, { isActive: args.isActive });
  },
});
