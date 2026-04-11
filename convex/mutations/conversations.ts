import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../users";

// Mirror of the source object validator in mutations/messages.ts. Kept
// in sync by hand because v.object() shapes can't be exported and
// re-imported between files cleanly. If you change one, change both.
const sourceObject = v.object({
  chunk_id: v.string(),
  doc_id: v.string(),
  text: v.string(),
  parent_text: v.optional(v.string()),
  source_type: v.string(),
  language: v.string(),
  collection: v.string(),
  title: v.string(),
  author_speaker: v.string(),
  publisher: v.string(),
  chapter_section: v.string(),
  page_number: v.optional(v.number()),
  timestamp_start: v.optional(v.number()),
  timestamp_end: v.optional(v.number()),
  score: v.optional(v.number()),
});

export const create = mutation({
  args: {
    title: v.string(),
    model: v.union(v.literal("gemini"), v.literal("claude")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const now = Date.now();
    return await ctx.db.insert("conversations", {
      userId: user._id,
      title: args.title,
      model: args.model,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
    });
  },
});

export const archive = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== user._id) return;
    await ctx.db.patch(args.conversationId, { isArchived: true });
  },
});

/**
 * Hard-delete a conversation and ALL its messages. Ownership-checked.
 *
 * Per Convex guidance, mutations are transactions with bounded read/write
 * limits. We page through messages in batches of 200 — for typical
 * conversations (≤ 100 messages) this completes in a single mutation; for
 * very long conversations the loop processes batches sequentially within
 * the same transaction.
 */
export const remove = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== user._id) {
      throw new Error("Conversation not found");
    }

    // Delete all messages for this conversation. Bounded loop to avoid
    // hitting Convex's per-mutation document limits on huge histories.
    const BATCH = 200;
    while (true) {
      const batch = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .take(BATCH);
      if (batch.length === 0) break;
      for (const msg of batch) {
        await ctx.db.delete(msg._id);
      }
      if (batch.length < BATCH) break;
    }

    // Then the conversation row itself.
    await ctx.db.delete(args.conversationId);
  },
});

export const updateTitle = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== user._id) return;
    await ctx.db.patch(args.conversationId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Create a new conversation seeded with an existing search query and
 * AI answer, so the user can keep chatting from where the search-page
 * AI Answer left off.
 *
 * Inserts atomically:
 *   1. A `conversations` row owned by the caller.
 *   2. A `messages` row with role="user" containing the original query.
 *   3. A `messages` row with role="assistant" containing the AI answer
 *      with the search results attached as `sources`. Marked as not
 *      streaming since it's already complete.
 *
 * Returns the new conversation id so the client can navigate to
 * `/chat/{id}` immediately.
 *
 * Auth required — anonymous users can't have a chat history. The web
 * UI hides the "Keep chatting" button for anon visitors.
 */
export const createFromSearch = mutation({
  args: {
    query: v.string(),
    aiAnswer: v.string(),
    sources: v.array(sourceObject),
    model: v.union(v.literal("gemini"), v.literal("claude")),
    /** The specific model variant the AI Answer was synthesized with
     *  (e.g. "gemini-2.5-flash"). Carried onto the seeded assistant
     *  message so the chat UI shows the right model badge. Optional. */
    modelVariant: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const now = Date.now();

    // Title: first 60 chars of the query, with ellipsis if truncated.
    // Same convention the chat sidebar uses for auto-titled conversations.
    const title =
      args.query.length > 60
        ? args.query.slice(0, 57).trimEnd() + "…"
        : args.query;

    const conversationId = await ctx.db.insert("conversations", {
      userId: user._id,
      title,
      model: args.model,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
    });

    // Seed the user message — the original search query, verbatim.
    // createdAt is now-1 so it sorts before the assistant message in
    // the by_conversation index even if both inserts land in the same
    // millisecond.
    await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: args.query,
      isStreaming: false,
      createdAt: now - 1,
    });

    // Seed the assistant message — the AI Answer the search page
    // already showed, with the same sources attached so the chat UI
    // can render citation chips and the source preview pane works.
    await ctx.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: args.aiAnswer,
      model: args.model,
      modelVariant: args.modelVariant,
      sources: args.sources,
      isStreaming: false,
      createdAt: now,
    });

    return conversationId;
  },
});

/** Generate a public read-only share token for a conversation. Idempotent —
 *  returns the existing token if one is already set. */
export const generateShareToken = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== user._id) {
      throw new Error("Conversation not found");
    }
    if (conv.shareToken) return conv.shareToken;

    // 22 char base32 random token (~110 bits of entropy)
    const token = randomToken(22);
    await ctx.db.patch(args.conversationId, { shareToken: token });
    return token;
  },
});

/** Revoke the share token (turn the conversation back into private). */
export const revokeShareToken = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== user._id) return;
    await ctx.db.patch(args.conversationId, { shareToken: undefined });
  },
});

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
function randomToken(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
