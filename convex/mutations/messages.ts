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
  passage_start: v.optional(v.number()),
  passage_end: v.optional(v.number()),
});

const researchStepObject = v.object({
  tool: v.string(),
  inputSummary: v.string(),
  resultCount: v.optional(v.number()),
  elapsedMs: v.optional(v.number()),
  isError: v.optional(v.boolean()),
  ts: v.number(),
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

/**
 * Patch research-agent progress mid-stream. Called by chat.sendMessage's
 * Sonnet 5 tool loop once per loop round so the web UI can render the
 * live "Researching…" timeline.
 */
export const updateResearchProgress = internalMutation({
  args: {
    messageId: v.id("messages"),
    researchStatus: v.optional(v.string()),
    researchSteps: v.optional(v.array(researchStepObject)),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.researchStatus !== undefined) patch.researchStatus = args.researchStatus;
    if (args.researchSteps !== undefined) patch.researchSteps = args.researchSteps;
    await ctx.db.patch(args.messageId, patch);
  },
});

/**
 * Watchdog sweep (see convex/crons.ts): finalize messages stuck in
 * `isStreaming: true` for longer than `olderThanMs` (default 12 min).
 * A Convex node action hard-caps at 10 minutes and is not retried, so
 * any crash mid-loop would otherwise leave a permanently spinning
 * message. Keeps whatever content/researchSteps already landed and
 * appends an error note.
 */
export const finalizeStuck = internalMutation({
  args: {
    olderThanMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanMs ?? 12 * 60 * 1000);
    const stuck = await ctx.db
      .query("messages")
      .withIndex("by_streaming", (q) =>
        q.eq("isStreaming", true).lt("createdAt", cutoff),
      )
      .collect();
    for (const msg of stuck) {
      const note =
        "\n\n> ⚠️ Bu yanıt tamamlanamadan kesildi. Lütfen tekrar deneyin. " +
        "(The response was interrupted before completion. Please try again.)";
      await ctx.db.patch(msg._id, {
        content: (msg.content ?? "") + note,
        isStreaming: false,
        agenticStatus: undefined,
        researchStatus: undefined,
      });
    }
    if (stuck.length > 0) {
      console.log(`finalizeStuck: finalized ${stuck.length} stuck message(s)`);
    }
    return stuck.length;
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
      // Clear the live statuses — the steps arrays stay around as the
      // permanent record of the agent's plan/timeline.
      agenticStatus: undefined,
      researchStatus: undefined,
    });
  },
});
