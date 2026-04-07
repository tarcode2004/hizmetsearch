/**
 * Chat action — RAG retrieval + LLM streaming via Convex mutations.
 *
 * Flow:
 * 1. Save user message
 * 2. Create placeholder assistant message (isStreaming: true)
 * 3. Call RAG API with user's query
 * 4. Stream LLM response, updating assistant message incrementally
 * 5. Finalize with sources
 */
import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

export const sendMessage = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    model: v.union(v.literal("gemini"), v.literal("claude")),
  },
  handler: async (ctx, args) => {
    // 1. Save user message
    await ctx.runMutation(api.mutations.messages.create, {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      isStreaming: false,
    });

    // 2. Create streaming placeholder
    const assistantMsgId = await ctx.runMutation(api.mutations.messages.create, {
      conversationId: args.conversationId,
      role: "assistant",
      content: "",
      model: args.model,
      isStreaming: true,
    });

    // 3. Call RAG API
    const ragUrl = process.env.RAG_API_URL ?? "http://localhost:8000";
    const ragKey = process.env.RAG_API_KEY ?? "";

    try {
      const ragResponse = await fetch(`${ragUrl}/api/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ragKey ? { "X-API-Key": ragKey } : {}),
        },
        body: JSON.stringify({
          query: args.content,
          top_k: 5,
          use_reranker: true,
        }),
      });

      const searchResults = ragResponse.ok ? await ragResponse.json() : { results: [] };

      // 4. In production: use Vercel AI SDK streamText here
      // For now, generate a placeholder response
      const sources = searchResults.results?.map((r: any) => r.chunk) ?? [];

      // 5. Finalize message
      await ctx.runMutation(api.mutations.messages.finalize, {
        messageId: assistantMsgId,
        content: "RAG response will be generated here when LLM providers are connected.",
        sources,
      });
    } catch (error) {
      await ctx.runMutation(api.mutations.messages.finalize, {
        messageId: assistantMsgId,
        content: "Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.",
      });
    }

    return assistantMsgId;
  },
});
