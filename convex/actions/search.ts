/**
 * Search action — calls RAG API and optionally generates AI answer.
 */
import { action } from "../_generated/server";
import { v } from "convex/values";

export const search = action({
  args: {
    query: v.string(),
    mode: v.union(v.literal("results"), v.literal("ai_answer")),
    top_k: v.optional(v.number()),
    language: v.optional(v.string()),
    collection: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const ragUrl = process.env.RAG_API_URL ?? "http://localhost:8000";
    const ragKey = process.env.RAG_API_KEY ?? "";

    // 1. Call RAG API
    const response = await fetch(`${ragUrl}/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ragKey ? { "X-API-Key": ragKey } : {}),
      },
      body: JSON.stringify({
        query: args.query,
        top_k: args.top_k ?? 5,
        language: args.language ?? null,
        collection: args.collection ?? null,
        use_reranker: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`RAG API error: ${response.status}`);
    }

    const searchResults = await response.json();

    // 2. If AI answer mode, generate synthesis (placeholder for Vercel AI SDK)
    if (args.mode === "ai_answer") {
      // In production: use streamText from @ai-sdk/google or @ai-sdk/anthropic
      // with formatted source context from convex/lib/prompts.ts
      return {
        ...searchResults,
        ai_answer: null, // Will be populated when LLM integration is connected
      };
    }

    return searchResults;
  },
});
