/**
 * Streaming search pipeline.
 *
 * Runs the same retrieval logic as `actions/search.ts` (query
 * expansion → fan-out → merge → highlight → optional AI answer) but
 * patches a `liveSearches` row at each milestone instead of returning
 * the whole result set at the end. The client subscribes to that row
 * via `useQuery` so it sees results land in stages:
 *
 *   1. expanding   — waiting on the rewrite call
 *   2. retrieving  — fan-out RAG calls in flight
 *   3. ranked      — merged + sorted results, no highlights yet
 *   4. highlighting — bolded versions trickling in
 *   5. synthesizing — AI answer being generated (only if mode=ai_answer)
 *   6. done        — everything finished
 *
 * The user sees the ranked results within ~500-700 ms (no need to
 * wait for the highlight or synthesis steps), and the page fills in
 * progressively after that.
 */
"use node";
// cache-bust 1
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { GoogleGenAI } from "@google/genai";
import {
  buildSearchAnswerPrompt,
  type SourceContext,
} from "../lib/prompts";
import { cerebrasComplete } from "../lib/cerebras";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const EXPAND_MODEL = "gemini-2.5-flash-lite";
// Highlight pass runs against Cerebras gemma-4-31b instead of Gemini
// Flash Lite. Gemini Flash Lite was the dominant search-latency cost
// (~30-60s for 18 parallel calls due to API serialization under rate
// limits). Cerebras runs ~100-1000x faster end-to-end (verified ~0.4 s
// per call warm). gemma-4-31b replaced llama3.1-8b when Cerebras
// dropped it from their catalog (404 model_not_found as of 2026-07);
// it's the only non-reasoning instruct model they currently serve.
// We deliberately do NOT use gpt-oss-120b or zai-glm-4.7 here because
// both are *reasoning* models that emit chain-of-thought before (or
// instead of) the actual answer — verified zai-glm-4.7 spends its
// entire max_tokens budget on reasoning and returns empty `content`
// for this simple "wrap relevant spans in **bold**" formatting task.
const HIGHLIGHT_MODEL = "gemma-4-31b" as const;

const DEFAULT_TOP_K = 18;
const PER_QUERY_TOP_K = 12;
const AI_ANSWER_MAX_SOURCES = 18;

interface MergedResult {
  chunk: Record<string, unknown>;
  score: number;
  rerank_score: number | null;
}

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
                "Rewrite the search query into 2-3 alternative natural " +
                "Turkish phrasings that mimic how source passages in a " +
                "Turkish Islamic-scholarship corpus (Risale-i Nur, " +
                "Fethullah Gülen, Hizmet) would phrase the same idea. " +
                "Use the corpus's own scholarly vocabulary (namaz, iman, " +
                "marifetullah, fariza, sıdk). Do NOT append author/source " +
                "tags like 'risale-i nur' or 'bediüzzaman' to every " +
                "variant — those words appear in nearly every chunk and " +
                "dilute retrieval. Vary the angle.\n\n" +
                "Respond with STRICT JSON only: {\"queries\": string[]}\n\n" +
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

async function highlightChunk(
  query: string,
  chunkText: string,
): Promise<string> {
  if (!chunkText || chunkText.length < 40) return chunkText;
  const text = chunkText.length > 3000 ? chunkText.slice(0, 3000) + "…" : chunkText;
  try {
    const result = await cerebrasComplete(
      [
        {
          role: "user",
          content:
            "You are highlighting parts of a passage that are most " +
            "relevant to a search query. Return the SAME passage but " +
            "wrap the most relevant words and phrases in **bold** " +
            "Markdown. Wrap at most 3 short spans, not entire " +
            "sentences. Do NOT summarize, translate, or add commentary. " +
            "Output ONLY the passage with bold added.\n\n" +
            `Query: ${query}\n\nPassage:\n${text}`,
        },
      ],
      {
        model: HIGHLIGHT_MODEL,
        temperature: 0,
        // Cap output at ~the input size + headroom for the **bold**
        // markup tokens. Cerebras' max_tokens is hard, so undersize and
        // we'll get a truncated highlight; we already fall back to the
        // raw chunk on length-mismatch below.
        maxTokens: Math.min(2048, Math.ceil(text.length / 2) + 400),
        timeoutMs: 10_000,
      },
    );
    const out = result.text.trim();
    // Sanity check: if the model returned something obviously wrong
    // (empty, or hugely shorter than input), fall back to the raw text.
    // This matches the previous Gemini-based behavior so the rest of
    // the pipeline is unchanged.
    if (!out || out.length < text.length * 0.5) return chunkText;
    return out;
  } catch (e) {
    console.warn("highlight failed:", e);
    return chunkText;
  }
}

export const run = internalAction({
  args: {
    id: v.id("liveSearches"),
    query: v.string(),
    mode: v.union(v.literal("results"), v.literal("ai_answer")),
    language: v.optional(v.string()),
    category: v.optional(
      v.union(
        v.literal("risale"),
        v.literal("risale_dersleri"),
        v.literal("pirlanta"),
        v.literal("hizmet"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const ragUrl = process.env.RAG_API_URL ?? "http://localhost:8000";
    const ragKey = process.env.RAG_API_KEY ?? "";
    const apiKey = process.env.GEMINI_API_KEY;
    const id = args.id;

    const tStart = Date.now();
    const patch = async (fields: {
      status?:
        | "pending"
        | "expanding"
        | "retrieving"
        | "ranked"
        | "highlighting"
        | "synthesizing"
        | "done"
        | "error";
      resultsJson?: string;
      aiAnswer?: string;
      expansions?: string[];
      errorMessage?: string;
    }) => {
      const t = Date.now() - tStart;
      const counts: string[] = [];
      if (fields.status) counts.push(`status=${fields.status}`);
      if (fields.resultsJson) {
        try {
          counts.push(`results=${(JSON.parse(fields.resultsJson) as unknown[]).length}`);
        } catch {
          counts.push("results=?");
        }
      }
      if (fields.aiAnswer) counts.push("ai=yes");
      console.log(`[liveSearch ${id} +${t}ms] patch ${counts.join(" ")}`);
      await ctx.runMutation(internal.mutations.liveSearches.patch, { id, ...fields });
    };

    try {
      // ─── 1. Query expansion (cheap LLM call) ─────────────────
      await patch({ status: "expanding" });
      const expandClient = apiKey ? new GoogleGenAI({ apiKey }) : null;
      const expansions =
        expandClient ? await expandQueries(expandClient, args.query) : [];
      await patch({ expansions });

      // ─── 2. Fan-out retrieval (sequential-ish, patch as we go) ──
      //
      // Originally this was a Promise.all. That made the user see
      // nothing until ALL queries returned together — no perceptible
      // streaming. Now we kick the requests off in parallel BUT
      // process them as they resolve, patching the row after each
      // query lands so the page fills in progressively.
      await patch({ status: "retrieving" });
      const queries = [args.query, ...expansions];

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
              category: args.category ?? null,
              use_reranker: true,
            }),
          });
          if (!r.ok) return null;
          return (await r.json()) as {
            results: MergedResult[];
            query: string;
            retrieval_time_ms: number;
          };
        } catch (e) {
          console.warn(`fan-out failed for "${q}":`, e);
          return null;
        }
      };

      const merged = new Map<string, MergedResult>();

      const computeRanked = (): MergedResult[] =>
        Array.from(merged.values())
          .sort(
            (a, b) =>
              (b.rerank_score ?? b.score) - (a.rerank_score ?? a.score),
          )
          .slice(0, DEFAULT_TOP_K);

      // Fire all fan-out queries in parallel; each fan-out's results
      // are then drip-fed into the row in groups of CHUNK_SIZE so the
      // user sees cards genuinely streaming in instead of a single
      // 12-result jump. We use a shared mutex (the `patchLock`
      // promise) to serialize patches across the parallel chains —
      // otherwise two queries that resolve simultaneously would race
      // their drip loops and we'd lose the perceptible spacing.
      // Drip-feed: small chunks with perceptible gaps. 60 ms was
      // too fast for the user to notice each wave; 150 ms with
      // smaller chunks of 2 makes the fill-in feel like real
      // streaming.
      const CHUNK_SIZE = 2;
      const CHUNK_DELAY_MS = 150;
      let firstLanded = false;
      let patchLock: Promise<void> = Promise.resolve();
      let lastPatchedCount = 0;

      const patchProgress = async () => {
        // Chain onto patchLock so concurrent callers serialize.
        const prev = patchLock;
        let release: () => void;
        patchLock = new Promise((r) => (release = r));
        try {
          await prev;
          const rankedNow = computeRanked();
          // Only patch if we have more items than the last patch,
          // otherwise we'd waste a write on identical state.
          if (rankedNow.length === lastPatchedCount) return;
          lastPatchedCount = rankedNow.length;
          await patch({
            status: firstLanded ? undefined : "ranked",
            resultsJson: JSON.stringify(rankedNow),
          });
          firstLanded = true;
        } finally {
          release!();
        }
      };

      await Promise.all(
        queries.map(async (q) => {
          const resp = await fanOut(q);
          if (!resp) return;
          // Drip-feed this query's results into the merged map in
          // CHUNK_SIZE chunks with small delays so the page renders
          // them as discrete waves rather than one giant jump.
          let added = 0;
          for (const item of resp.results) {
            const chunkId = String(item.chunk.chunk_id ?? "");
            if (!chunkId) continue;
            const existing = merged.get(chunkId);
            const newKey = item.rerank_score ?? item.score;
            const oldKey = existing
              ? (existing.rerank_score ?? existing.score)
              : -Infinity;
            if (!existing || newKey > oldKey) {
              (item.chunk as Record<string, unknown>).matched_query = q;
              merged.set(chunkId, item);
              added++;
            }
            if (added > 0 && added % CHUNK_SIZE === 0) {
              await patchProgress();
              await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
            }
          }
          // Flush any remainder for this query.
          if (added % CHUNK_SIZE !== 0) {
            await patchProgress();
          }
        }),
      );

      const ranked = computeRanked();

      // ─── 5. Highlight pass — streamed in batches ─────────────
      //
      // Highlights are 18 parallel Cerebras calls. We don't want to
      // await all of them before patching — even at Cerebras speeds
      // (~300-700 ms each warm) that's a perceptible blackout where
      // the user sees results but no progress. Instead we batch the
      // patches: every time N highlights land we re-patch resultsJson
      // so the page picks up the new bolded spans incrementally.
      if (ranked.length > 0) {
        await patch({ status: "highlighting" });
        try {
          const HIGHLIGHT_PATCH_BATCH = 4;
          let landed = 0;
          let pendingFlush = false;

          const flush = async () => {
            if (pendingFlush) return;
            pendingFlush = true;
            // Tiny tick to coalesce multiple back-to-back arrivals.
            await new Promise((r) => setTimeout(r, 0));
            pendingFlush = false;
            await patch({ resultsJson: JSON.stringify(ranked) });
          };

          await Promise.all(
            ranked.map(async (r) => {
              const text = String(r.chunk.text ?? "");
              const highlighted = await highlightChunk(args.query, text);
              (r.chunk as Record<string, unknown>).highlighted_text = highlighted;
              landed++;
              if (landed % HIGHLIGHT_PATCH_BATCH === 0) {
                await flush();
              }
            }),
          );
          // Final flush to catch the remainder.
          await patch({ resultsJson: JSON.stringify(ranked) });
        } catch (e) {
          console.warn("highlight pass failed (non-fatal):", e);
        }
      }

      // ─── 6. Optional AI answer synthesis ─────────────────────
      let aiAnswerText: string | null = null;
      if (args.mode === "ai_answer" && apiKey) {
        await patch({ status: "synthesizing" });
        aiAnswerText = await runAiSynthesis(ranked, args.query, apiKey);
        if (aiAnswerText) {
          await patch({ aiAnswer: aiAnswerText });
        }
      }

      // ─── 7. Done — also write to history cache ───────────────
      await patch({ status: "done" });

      // Best-effort: log to history with the cached payload so the
      // sidebar can show this search and clicking it restores
      // results without re-running the pipeline.
      try {
        const trimmedForCache = ranked.map((r) => ({
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
        await ctx.runMutation(api.mutations.searchHistory.add, {
          query: args.query,
          resultCount: ranked.length,
          mode: args.mode,
          cachedResultsJson: JSON.stringify(trimmedForCache),
          cachedExpansions: expansions.length > 0 ? expansions : undefined,
          cachedAiAnswer: aiAnswerText ?? undefined,
        });
      } catch (e) {
        console.warn("history cache write failed (non-fatal):", e);
      }
    } catch (err) {
      console.error("liveSearch.run failed", err);
      await patch({
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});


/**
 * Run only the AI synthesis pass over a set of already-ranked results.
 *
 * Extracted from `run()` so it can be reused by `synthesize()` below
 * (which gets called when the user toggles a results-only search to AI
 * mode without re-running retrieval). Idempotent — returns null on any
 * failure so callers can fall back gracefully.
 */
async function runAiSynthesis(
  ranked: MergedResult[],
  query: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const sourceContexts: SourceContext[] = ranked
      .slice(0, AI_ANSWER_MAX_SOURCES)
      .map((r, i) => ({
        index: i + 1,
        title: String(r.chunk.title ?? ""),
        author: String(r.chunk.author_speaker ?? ""),
        text: String(r.chunk.text ?? ""),
        collection: r.chunk.collection as string | undefined,
        language: r.chunk.language as string | undefined,
        section: r.chunk.chapter_section as string | undefined,
        page: (r.chunk.page_number as number | null | undefined) ?? null,
        timestamp:
          (r.chunk.timestamp_start as number | null | undefined) ?? null,
        timestampEnd:
          (r.chunk.timestamp_end as number | null | undefined) ?? null,
      }));
    const isTurkish = /[ıİğĞşŞçÇöÖüÜ]/.test(query);
    const prompt = buildSearchAnswerPrompt({
      sources: sourceContexts,
      query,
      language: isTurkish ? "tr" : "en",
    });
    const client = new GoogleGenAI({ apiKey });
    const result = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt.body,
    });
    return result.text ?? null;
  } catch (e) {
    console.warn("AI answer synthesis failed (non-fatal):", e);
    return null;
  }
}


/**
 * Synthesize an AI answer for a `liveSearches` row that already has
 * ranked + highlighted results, without re-running the retrieval
 * pipeline. Used when the user toggles search mode from "results" to
 * "AI Answer" on an existing query — re-running expansion + fan-out +
 * highlighting would be wasteful when we already have the same chunks
 * the synthesis pass would consume anyway.
 *
 * Patches the row through `synthesizing` → `done` (or `error`) so the
 * frontend's existing useQuery subscription picks up the answer the
 * same way it does for a fresh ai_answer search.
 */
export const synthesize = internalAction({
  args: { id: v.id("liveSearches") },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const tStart = Date.now();
    const patch = async (fields: {
      status?: "synthesizing" | "done" | "error";
      aiAnswer?: string;
      errorMessage?: string;
    }) => {
      const t = Date.now() - tStart;
      console.log(`[liveSearch.synthesize ${args.id} +${t}ms]`, fields.status ?? "patch");
      await ctx.runMutation(internal.mutations.liveSearches.patch, {
        id: args.id,
        ...fields,
      });
    };

    try {
      // Read the row via the internal (auth-bypassing) query. Public
      // `liveSearches.get` enforces ownership via getCurrentUser(ctx),
      // which returns null for scheduler-invoked internal actions —
      // they don't carry an auth identity, so the public query would
      // always return null and we'd hit "row not found" here.
      // Ownership was already validated by `requestAiAnswer` before
      // it scheduled this action, so we can safely bypass the check.
      const row = await ctx.runQuery(internal.queries.liveSearches.getInternal, {
        id: args.id,
      });
      if (!row) {
        await patch({ status: "error", errorMessage: "row not found" });
        return;
      }
      if (!row.resultsJson) {
        await patch({
          status: "error",
          errorMessage: "row has no results to synthesize from",
        });
        return;
      }
      if (!apiKey) {
        await patch({ status: "error", errorMessage: "GEMINI_API_KEY not set" });
        return;
      }

      const ranked = JSON.parse(row.resultsJson) as MergedResult[];
      await patch({ status: "synthesizing" });
      const text = await runAiSynthesis(ranked, row.query, apiKey);
      if (text) {
        await patch({ aiAnswer: text, status: "done" });
      } else {
        await patch({
          status: "error",
          errorMessage: "synthesis returned no text",
        });
      }
    } catch (err) {
      console.error("liveSearch.synthesize failed", err);
      await patch({
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});
