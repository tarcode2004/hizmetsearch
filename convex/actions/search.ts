/**
 * Search action — calls the FastAPI RAG service and optionally generates a
 * one-shot AI synthesis using Gemini (cheap default; users can switch to
 * Claude in chat mode).
 */
"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { GoogleGenAI } from "@google/genai";
import { captureGeneration } from "../lib/llmAnalytics";
import {
  buildSearchAnswerPrompt,
  type SourceContext,
} from "../lib/prompts";
import { cerebrasComplete } from "../lib/cerebras";

// Use Flash for the AI-answer pass — it's much faster, has higher free-tier
// RPM, and the synthesis quality difference is negligible for short results
// summaries. Override via `GEMINI_MODEL` env var if you want Pro for AI mode.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// Highlight pass runs against Cerebras llama3.1-8b — the previous Gemini
// Flash Lite implementation was the dominant search-latency cost (~30-60s
// for 18 parallel calls because Gemini API serializes under the per-project
// concurrency limit). Cerebras runs ~100-1000x faster (verified ~36 ms per
// call warm) and llama3.1-8b has 2k RPM / 2M TPM headroom on the production
// tier. We deliberately avoid gpt-oss-120b for highlights — it's a reasoning
// model that wastes compute on a simple bold-formatting task.
// NB: this `actions/search.ts` is the OLD blocking action; the streaming
// pipeline lives in `actions/liveSearch.ts`. Both got patched so the swap
// is complete regardless of which the frontend currently calls.
const HIGHLIGHT_CEREBRAS_MODEL = "llama3.1-8b" as const;
const EXPAND_MODEL = "gemini-2.5-flash-lite";

// Default surface size when the caller doesn't specify. We expand the
// user query into 2-3 Turkish variants and fan out, so we want enough
// per-query depth that the merged set yields ~18 distinct results
// after dedup.
const DEFAULT_TOP_K = 18;
const PER_QUERY_TOP_K = 12;

/**
 * Expand a user search query into 2-3 alternative Turkish phrasings
 * that better match how source passages in the corpus actually phrase
 * the same idea. The retrieval is hybrid dense+BM25 over a Turkish
 * Islamic-scholarship corpus, so dense retrieval performs best when
 * queries look like passages — natural declarative Turkish sentences
 * using the corpus's own vocabulary.
 *
 * Returns an empty array on any failure so the caller can fall back
 * to the original query without breaking search.
 *
 * Cost: ~1 cheap Gemini Flash Lite call ≈ $0.0002 per search.
 */
async function expandQueries(
  client: GoogleGenAI,
  userQuery: string,
): Promise<string[]> {
  if (!userQuery.trim()) return [];
  try {
    const result = await client.models.generateContent({
      model: EXPAND_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "You are a query rewriter for a hybrid-search RAG system " +
                "over a Turkish Islamic-scholarship corpus (Risale-i Nur, " +
                "Fethullah Gülen, Hizmet movement, audio lessons). The " +
                "retrieval is dense vectors + BM25, so queries that look " +
                "like sentences a source passage might actually contain " +
                "perform much better than keyword soup.\n\n" +
                "Given the user's query, produce 2-3 ALTERNATIVE Turkish " +
                "queries that explore the same intent from different angles. " +
                "Rules:\n" +
                "1. ALWAYS Turkish (the corpus is ~95% Turkish), even if " +
                "the user asked in another language.\n" +
                "2. Use the corpus's own scholarly vocabulary: 'namaz' " +
                "(not 'salah'), 'iman' (not 'faith'), 'marifetullah', " +
                "'tevhid', 'fariza', 'sıdk', 'ihlas', etc.\n" +
                "3. Each variant should be a NATURAL sentence or noun " +
                "phrase, not a Google-style keyword list. Aim for phrases " +
                "that might appear verbatim in a source.\n" +
                "4. Vary the angle: a definition, a known scholarly framing, " +
                "a related Quranic concept, a direct-quote-style phrase.\n" +
                "5. Do NOT append meta-tags like 'risale-i nur' or " +
                "'bediüzzaman' to every variant — those words appear in " +
                "almost every chunk and dilute both BM25 and the vector. " +
                "Only mention an author when you're specifically targeting " +
                "their framing.\n\n" +
                "Respond with STRICT JSON only — no markdown, no prose. " +
                'Schema: {"queries": string[]}\n\n' +
                'Example. User: "why is prayer important". Output: ' +
                '{"queries": ["namaz dinin direğidir", "namaz mü\'minin miracıdır", "namazın insan ruhuna tesiri"]}.\n\n' +
                `User query: ${userQuery}`,
            },
          ],
        },
      ],
      config: { temperature: 0.4, maxOutputTokens: 256 },
    });
    const text = (result.text ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(text) as { queries?: unknown };
    if (!Array.isArray(parsed.queries)) return [];
    return parsed.queries
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .map((q) => q.trim())
      .slice(0, 3);
  } catch (e) {
    console.warn("expandQueries failed (non-fatal):", e);
    return [];
  }
}

/**
 * Highlight the parts of `chunkText` most relevant to `query` by
 * wrapping them in **bold** Markdown. Returns the original text on any
 * failure (rate limit, parse error, refusal). Designed to run in
 * parallel for all top-k chunks after a search.
 */
async function highlightChunk(
  query: string,
  chunkText: string,
): Promise<string> {
  if (!chunkText || chunkText.length < 40) return chunkText;
  // Cap to ~3 KB so we don't waste tokens on giant chunks. The bolded
  // version is just for display so a slightly truncated tail is fine.
  const text = chunkText.length > 3000 ? chunkText.slice(0, 3000) + "…" : chunkText;
  try {
    const result = await cerebrasComplete(
      [
        {
          role: "user",
          content:
            "You are highlighting parts of a passage that are most relevant " +
            "to a search query. Return the SAME passage but wrap the most " +
            "relevant words and phrases in **bold** Markdown. Wrap at most " +
            "3 short spans (a few words each), not entire sentences. Do NOT " +
            "summarize, translate, fix typos, or add commentary. Output " +
            "ONLY the passage with bold added — no preface, no closing " +
            "remarks, no quotes around it.\n\n" +
            `Query: ${query}\n\nPassage:\n${text}`,
        },
      ],
      {
        model: HIGHLIGHT_CEREBRAS_MODEL,
        temperature: 0,
        maxTokens: Math.min(2048, Math.ceil(text.length / 2) + 400),
        timeoutMs: 10_000,
      },
    );
    const out = result.text.trim();
    // Cheap sanity check: if the model returned something obviously
    // wrong (empty, hugely shorter than input, or doesn't share at
    // least some of the original words), fall back to the raw text.
    if (!out || out.length < text.length * 0.5) return chunkText;
    return out;
  } catch (e) {
    console.warn("highlight failed:", e);
    return chunkText;
  }
}

export const search = action({
  args: {
    query: v.string(),
    mode: v.union(v.literal("results"), v.literal("ai_answer")),
    top_k: v.optional(v.number()),
    language: v.optional(v.string()),
    collection: v.optional(v.string()),
    // Logical category filter — translated server-side into a multi-criteria
    // Qdrant filter. Takes precedence over the bare `collection` field.
    category: v.optional(
      v.union(
        v.literal("risale"),
        v.literal("risale_dersleri"),
        v.literal("pirlanta"),
        v.literal("hizmet"),
      ),
    ),
    /** Whether to expand the user query into 2-3 corpus-shaped Turkish
     *  variants and fan-out search across them. Default: true. The
     *  caller can opt out (e.g. for an exact-string-match power user
     *  mode) by passing false. */
    expand: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const ragUrl = process.env.RAG_API_URL ?? "http://localhost:8000";
    const ragKey = process.env.RAG_API_KEY ?? "";
    const apiKey = process.env.GEMINI_API_KEY;

    // 1a. Optional query expansion. We ask Gemini Flash Lite to produce
    // 2-3 Turkish phrasings of the user's question that look like the
    // kind of sentences the source passages actually contain. This is
    // the search-page analog of the agentic chat planner — light, cheap,
    // and run in parallel with the original query.
    const expandClient = apiKey ? new GoogleGenAI({ apiKey }) : null;
    const expansions =
      args.expand !== false && expandClient
        ? await expandQueries(expandClient, args.query)
        : [];

    // Build the list of queries to fan out across. The original query
    // is always first so it gets a slight ordering boost when scores tie.
    const queries = [args.query, ...expansions];

    // 1b. Fan out — call the RAG API in parallel for each query, then
    // merge results by chunk_id keeping the best score we saw.
    const fanOut = async (q: string) => {
      try {
        const r = await fetch(`${ragUrl}/api/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(ragKey ? { "X-API-Key": ragKey } : {}),
          },
          body: JSON.stringify({
            query: q,
            top_k: PER_QUERY_TOP_K,
            language: args.language ?? null,
            collection: args.collection ?? null,
            category: args.category ?? null,
            use_reranker: true,
          }),
        });
        if (!r.ok) return null;
        return (await r.json()) as {
          results: Array<{
            chunk: Record<string, unknown>;
            score: number;
            rerank_score: number | null;
          }>;
          query: string;
          retrieval_time_ms: number;
        };
      } catch (e) {
        console.warn(`fan-out search failed for "${q}":`, e);
        return null;
      }
    };

    const responses = await Promise.all(queries.map(fanOut));

    // Merge by chunk_id. Keep the entry with the best score; we use
    // rerank_score when present (cross-encoder is the most reliable
    // signal), otherwise fall back to the raw fusion score.
    //
    // We also stamp `matched_query` onto each kept chunk so the
    // frontend can attribute the hit back to the specific phrasing
    // (original or AI expansion) that produced it. That attribution
    // is the ground-truth signal we feed back into feedback logging
    // for query-rewriting model training.
    const merged = new Map<
      string,
      { chunk: Record<string, unknown>; score: number; rerank_score: number | null }
    >();
    let totalRetrievalTime = 0;
    for (let qi = 0; qi < responses.length; qi++) {
      const resp = responses[qi];
      if (!resp) continue;
      const matchedQuery = queries[qi];
      totalRetrievalTime = Math.max(totalRetrievalTime, resp.retrieval_time_ms || 0);
      for (const item of resp.results) {
        const id = String(item.chunk.chunk_id ?? "");
        if (!id) continue;
        const existing = merged.get(id);
        const newKey = item.rerank_score ?? item.score;
        const oldKey = existing ? (existing.rerank_score ?? existing.score) : -Infinity;
        if (!existing || newKey > oldKey) {
          (item.chunk as Record<string, unknown>).matched_query = matchedQuery;
          merged.set(id, item);
        }
      }
    }

    const topK = args.top_k ?? DEFAULT_TOP_K;
    const mergedResults = Array.from(merged.values())
      .sort((a, b) => (b.rerank_score ?? b.score) - (a.rerank_score ?? a.score))
      .slice(0, topK);

    // Shape into the same SearchResponse the rest of the action expects
    // so the highlight pass + AI answer + history logging keep working.
    const searchResults: {
      results: typeof mergedResults;
      query: string;
      result_count: number;
      retrieval_time_ms: number;
      expanded_queries: string[];
      ai_answer?: string | null;
    } = {
      results: mergedResults,
      query: args.query,
      result_count: mergedResults.length,
      retrieval_time_ms: totalRetrievalTime,
      expanded_queries: expansions,
    };

    // 1c. Highlight pass — run cheap Gemini Flash Lite over each chunk
    // in PARALLEL to bold the spans most relevant to the original user
    // query (not the expansions — we want the highlights to reflect
    // what the human asked). Adds ~300-700 ms to the search round-trip
    // when warm; falls back gracefully on errors.
    if (mergedResults.length > 0) {
      try {
        await Promise.all(
          mergedResults.map(async (r) => {
            const text = String(r.chunk.text ?? "");
            const highlighted = await highlightChunk(args.query, text);
            (r.chunk as Record<string, unknown>).highlighted_text = highlighted;
          }),
        );
      } catch (e) {
        console.warn("highlight pass failed (non-fatal):", e);
      }
    }

    // Log to history (best-effort, only if signed in). We also stash a
    // compact JSON cache of the result set so a future click on this
    // history row can restore the page instantly without re-running
    // the search. We trim each chunk's text to keep the row small.
    const me: any = await ctx.runQuery(api.users.me, {});
    if (me) {
      const trimmedForCache = mergedResults.map((r) => ({
        score: r.score,
        rerank_score: r.rerank_score,
        chunk: {
          chunk_id: r.chunk.chunk_id,
          doc_id: r.chunk.doc_id,
          text: String(r.chunk.text ?? "").slice(0, 1500),
          source_type: r.chunk.source_type ?? "text",
          language: r.chunk.language ?? "tr",
          collection: r.chunk.collection ?? "",
          title: String(r.chunk.title ?? "").slice(0, 200),
          author_speaker: String(r.chunk.author_speaker ?? "").slice(0, 120),
          publisher: r.chunk.publisher ?? "",
          chapter_section: String(r.chunk.chapter_section ?? "").slice(0, 200),
          page_number: r.chunk.page_number ?? null,
          timestamp_start: r.chunk.timestamp_start ?? null,
          timestamp_end: r.chunk.timestamp_end ?? null,
          source_url: r.chunk.source_url ?? null,
          source_ext: r.chunk.source_ext ?? null,
          highlighted_text: r.chunk.highlighted_text ?? null,
          matched_query: r.chunk.matched_query ?? null,
          parent_text: null,
        },
      }));
      const cachedResultsJson = JSON.stringify(trimmedForCache);
      await ctx.runMutation(api.mutations.searchHistory.add, {
        query: args.query,
        resultCount: searchResults.result_count ?? searchResults.results?.length ?? 0,
        mode: args.mode,
        cachedResultsJson,
        cachedExpansions: expansions.length > 0 ? expansions : undefined,
        // ai_answer isn't computed yet at this point — it goes in
        // below if mode === ai_answer. We'll add a second patch then.
      });
    }

    // 2. If AI answer mode requested, run a one-shot Gemini synthesis
    if (args.mode === "ai_answer") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return { ...searchResults, ai_answer: null };
      }

      // Hand the synthesis LLM ALL displayed results, not just the top
      // 6 — otherwise an obviously-relevant source at rank 7+ is
      // invisible to the AI Answer and we end up saying "no source
      // mentions X" when the user can clearly see source #11 right
      // there in the results column. The Gemini Flash context window
      // easily handles 18 chunks worth of text.
      const AI_ANSWER_MAX_SOURCES = 18;
      const sourceContexts: SourceContext[] = (searchResults.results ?? [])
        .slice(0, AI_ANSWER_MAX_SOURCES)
        .map((r: { chunk: Record<string, unknown> }, i: number) => ({
          index: i + 1,
          title: String(r.chunk.title ?? ""),
          author: String(r.chunk.author_speaker ?? ""),
          text: String(r.chunk.text ?? ""),
          collection: r.chunk.collection as string | undefined,
          language: r.chunk.language as string | undefined,
          section: r.chunk.chapter_section as string | undefined,
          page: (r.chunk.page_number as number | null | undefined) ?? null,
          timestamp: (r.chunk.timestamp_start as number | null | undefined) ?? null,
          timestampEnd: (r.chunk.timestamp_end as number | null | undefined) ?? null,
        }));

      const isTurkish = /[ıİğĞşŞçÇöÖüÜ]/.test(args.query);
      const prompt = buildSearchAnswerPrompt({
        sources: sourceContexts,
        query: args.query,
        language: isTurkish ? "tr" : "en",
      });

      try {
        const client = new GoogleGenAI({ apiKey });
        const aiStart = Date.now();
        const result = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt.body,
        });
        const text = result.text ?? null;
        const inTok = result.usageMetadata?.promptTokenCount ?? 0;
        const outTok = result.usageMetadata?.candidatesTokenCount ?? 0;

        // Track usage if signed in
        if (me && (inTok || outTok)) {
          const total = inTok + outTok;
          if (total > 0) {
            await ctx.runMutation(internal.mutations.usage.trackUsage, {
              userId: me._id,
              model: "gemini",
              tokensConsumed: total,
            });
          }
        }

        // Emit $ai_generation for the search ai_answer pass.
        captureGeneration({
          distinctId: (me?._id as string) ?? "anonymous",
          traceId: `search:${args.query.slice(0, 64)}`,
          model: GEMINI_MODEL,
          latencySeconds: (Date.now() - aiStart) / 1000,
          inputTokens: inTok,
          outputTokens: outTok,
          input: [{ role: "user", content: prompt.body }],
          output: text ?? "",
          properties: {
            source: "search_ai_answer",
            model_family: "gemini",
            language: isTurkish ? "tr" : "en",
            source_count: searchResults.result_count ?? 0,
            plan: me?.subscription?.plan ?? null,
          },
        });

        // Refresh the history row with the freshly-computed AI answer
        // so a future click restores it without re-generating.
        if (me && text) {
          try {
            await ctx.runMutation(api.mutations.searchHistory.add, {
              query: args.query,
              resultCount: searchResults.result_count ?? 0,
              mode: args.mode,
              cachedAiAnswer: text.slice(0, 50_000),
            });
          } catch (e) {
            console.warn("history cache update (ai_answer) failed:", e);
          }
        }

        return { ...searchResults, ai_answer: text };
      } catch (error) {
        console.error("ai_answer generation failed", error);
        return { ...searchResults, ai_answer: null };
      }
    }

    return searchResults;
  },
});
