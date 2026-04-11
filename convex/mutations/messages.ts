/**
 * Message mutations.
 *
 * All exports are `internalMutation` because the only legitimate caller is
 * the `chat.sendMessage` action — clients must never insert or patch
 * messages directly. Reads still go through `queries/messages.byConversation`
 * which enforces ownership via auth identity.
 */
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

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

export const create = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    model: v.optional(v.union(v.literal("gemini"), v.literal("claude"))),
    modelVariant: v.optional(v.string()),
    isStreaming: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const updateContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { content: args.content });
  },
});

/**
 * Patch agentic-mode progress mid-stream. Used by chat.sendMessage when
 * running a multi-round deep search so the web UI can show "Searching X…"
 * and append each round's plan as it lands.
 */
export const updateAgenticProgress = internalMutation({
  args: {
    messageId: v.id("messages"),
    agenticStatus: v.optional(v.string()),
    agenticSteps: v.optional(
      v.array(
        v.object({
          query: v.string(),
          resultCount: v.number(),
          reasoning: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.agenticStatus !== undefined) patch.agenticStatus = args.agenticStatus;
    if (args.agenticSteps !== undefined) patch.agenticSteps = args.agenticSteps;
    await ctx.db.patch(args.messageId, patch);
  },
});

export const finalize = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    sources: v.optional(v.array(sourceObject)),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      sources: args.sources,
      isStreaming: false,
      // Clear the live status — the steps array stays around as the
      // permanent record of the agent's search plan.
      agenticStatus: undefined,
    });
  },
});
