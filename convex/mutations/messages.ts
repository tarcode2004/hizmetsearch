import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    model: v.optional(v.union(v.literal("gemini"), v.literal("claude"))),
    isStreaming: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const updateContent = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { content: args.content });
  },
});

export const finalize = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    sources: v.optional(
      v.array(
        v.object({
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
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      sources: args.sources,
      isStreaming: false,
    });
  },
});
