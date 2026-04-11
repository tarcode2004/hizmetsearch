/**
 * Chat action — RAG retrieval + LLM streaming.
 *
 * Flow:
 *   1. Verify user, save user message
 *   2. Create assistant placeholder (isStreaming: true)
 *   3. Retrieve sources via FastAPI /api/search
 *   4. Stream LLM response from Anthropic (Claude) or Google GenAI (Gemini),
 *      patching the assistant message after each chunk so the web client's
 *      reactive query updates in real time
 *   5. Finalize message with sources + tracked token usage
 *
 * BYOK: if the user has saved their own API key in `apiKeys` and `isActive`,
 *       it overrides the platform-wide env key for the chosen model.
 */
"use node";
import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import {
  buildChatGeminiPrompt,
  buildChatGeminiLeanPrompt,
  buildChatClaudePrompt,
  buildChatClaudeLeanPrompt,
  toAnthropicMessages,
  type SourceContext,
} from "../lib/prompts";
import { DAILY_LIMITS } from "../lib/planLimits";
import { resolveModelId } from "../lib/modelCatalog";
import { captureGeneration } from "../lib/llmAnalytics";

const MAX_HISTORY = 10;
// Conservative output cap. Chat replies almost never need more than 1k
// tokens; capping here protects against runaway generations on a stuck
// stream and aligns with Sonnet's pricing curve. Bumped for agentic
// mode where the synthesis step has 30+ sources to weave together.
const CLAUDE_MAX_TOKENS = 1024;
const CLAUDE_MAX_TOKENS_AGENTIC = 2048;
// Agentic mode caps. The planner is a cheap Gemini Flash Lite call that
// chooses follow-up queries; the round budget is the hard ceiling on
// total search calls (≈ retrieval cost), and the source budget is the
// cap on the number of distinct chunks we'll feed into the synthesis.
const AGENTIC_MAX_ROUNDS = 6;
const AGENTIC_MAX_SOURCES = 36;
const AGENTIC_TOP_K = 8;
const AGENTIC_PLANNER_MODEL = "gemini-2.5-flash-lite";
const LLM_RETRY_ATTEMPTS = 2; // 1 initial try + up to 2 retries on transient errors
// Stream flush throttle. We patch the streaming message at most once per
// MIN_FLUSH_INTERVAL_MS milliseconds, with an additional minimum of
// STREAM_FLUSH_CHARS new characters since the last flush. This coalesces
// the burst of small tokens that LLMs emit while still feeling like real
// streaming to the user.
const STREAM_FLUSH_CHARS = 32;
const MIN_FLUSH_INTERVAL_MS = 80;

export const sendMessage = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    model: v.union(v.literal("gemini"), v.literal("claude")),
    /** Optional specific variant within the family (e.g. "claude-opus-4-5",
     *  "gemini-2.5-flash-lite"). Falls back to the family default. */
    modelVariant: v.optional(v.string()),
    /** Deep-search mode. When true the action runs a multi-round
     *  retrieval loop driven by a cheap planner LLM, gathering up to
     *  AGENTIC_MAX_SOURCES distinct chunks across AGENTIC_MAX_ROUNDS
     *  search calls before handing the bundle to the main model. */
    agentic: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"messages">> => {
    // 1. Verify auth + load user (which includes the live subscription).
    // Explicit type annotation breaks the TS circularity that arises from
    // cross-file api references (per Convex guidelines on runQuery/runMutation).
    const me: any = await ctx.runQuery(api.users.me, {});
    if (!me) throw new Error("Not authenticated");

    // 1b. Server-side budget enforcement — refuse if the user is out of
    //     tokens AND has no BYOK key for the chosen model. The web also
    //     checks this, but we re-verify here so a malicious client cannot
    //     bypass the limit by calling the action directly.
    const sub = me.subscription;
    const byokActive = me.byokActive;
    if (!byokActive && sub) {
      const isClaude = args.model === "claude";
      const used = isClaude ? sub.claudeTokensUsed : sub.geminiTokensUsed;
      const limit = isClaude ? sub.claudeTokensLimit : sub.geminiTokensLimit;
      const credit = isClaude
        ? sub.claudeCreditTokens ?? 0
        : sub.geminiCreditTokens ?? 0;
      if (used >= limit && credit <= 0) {
        throw new Error(
          `Token budget exhausted for ${args.model}. Upgrade your plan, buy a credit pack, or add your own API key in Settings.`
        );
      }

      // Enforce daily cap as well — protects against runaway scripts
      // draining the monthly allotment in one bad day.
      const dailyCap = DAILY_LIMITS[sub.plan as "free" | "pro" | "scholar"];
      if (dailyCap) {
        const todayUsed = isClaude
          ? sub.claudeTokensToday ?? 0
          : sub.geminiTokensToday ?? 0;
        const dayCap = isClaude ? dailyCap.claude : dailyCap.gemini;
        const dayResetAt = sub.dayResetAt ?? 0;
        // Only enforce if we're inside the current day window — when the
        // window has rolled over the trackUsage mutation will reset the
        // counter on the next call.
        if (Date.now() < dayResetAt && todayUsed >= dayCap && credit <= 0) {
          throw new Error(
            `Daily token cap reached for ${args.model}. Resets in a few hours, or buy a credit pack / use your own API key.`
          );
        }
      }
    }

    // Resolve the user's variant pick to an actual SDK model id.
    const resolvedModelId = resolveModelId(args.model, args.modelVariant);

    // 2. Save user message
    await ctx.runMutation(internal.mutations.messages.create, {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      isStreaming: false,
    });

    // 3. Create streaming placeholder. Explicit type annotation here breaks
    // a TS circularity arising from messages.create returning an Id whose
    // type depends on the schema's full data model graph.
    const assistantMsgId: Id<"messages"> = await ctx.runMutation(
      internal.mutations.messages.create,
      {
        conversationId: args.conversationId,
        role: "assistant",
        content: "",
        model: args.model,
        modelVariant: resolvedModelId,
        isStreaming: true,
      }
    );

    try {
      // 4. Retrieve sources from RAG API.
      //
      //    Graceful degradation: if the FastAPI service is unreachable
      //    (not yet deployed, transient outage, network blip) we proceed
      //    with an empty source list rather than killing the chat. The
      //    LLM will still answer; the user just won't get citations.
      //    This is intentional — RAG outage shouldn't break chat entirely.
      const ragUrl = process.env.RAG_API_URL ?? "http://localhost:8000";
      const ragKey = process.env.RAG_API_KEY ?? "";
      let rawSources: Array<{
        chunk: Record<string, unknown>;
        score: number;
      }> = [];
      let agenticSteps:
        | Array<{ query: string; resultCount: number; reasoning?: string }>
        | undefined;

      if (args.agentic) {
        // ─── Agentic deep-search loop ────────────────────────────
        //
        // Round 1 always runs the user query as-is. Subsequent rounds
        // ask a cheap planner LLM to look at what we already retrieved
        // and choose 1-3 follow-up queries that fill in gaps. We dedupe
        // sources across rounds by chunk_id and stop early when the
        // planner says we're done or we hit the source budget.
        const plannerKey = process.env.GEMINI_API_KEY;
        const plannerClient = plannerKey ? new GoogleGenAI({ apiKey: plannerKey }) : null;
        const sourceById = new Map<string, { chunk: Record<string, unknown>; score: number }>();
        const stepsAcc: Array<{ query: string; resultCount: number; reasoning?: string }> = [];
        const queriesTried = new Set<string>();

        const runOneSearch = async (q: string): Promise<number> => {
          try {
            const r = await fetch(`${ragUrl}/api/search`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(ragKey ? { "X-API-Key": ragKey } : {}),
              },
              body: JSON.stringify({
                query: q,
                top_k: AGENTIC_TOP_K,
                use_reranker: true,
              }),
            });
            if (!r.ok) return 0;
            const json = await r.json();
            const results = (json.results ?? []) as Array<{
              chunk: Record<string, unknown>;
              score: number;
            }>;
            let added = 0;
            for (const item of results) {
              const id = String(item.chunk.chunk_id ?? "");
              if (!id || sourceById.has(id)) continue;
              sourceById.set(id, item);
              added++;
              if (sourceById.size >= AGENTIC_MAX_SOURCES) break;
            }
            return added;
          } catch (e) {
            console.warn("agentic search call failed:", e);
            return 0;
          }
        };

        const patchProgress = async (status: string) => {
          try {
            await ctx.runMutation(internal.mutations.messages.updateAgenticProgress, {
              messageId: assistantMsgId,
              agenticStatus: status,
              agenticSteps: stepsAcc,
            });
          } catch (e) {
            console.warn("agentic progress patch failed:", e);
          }
        };

        // Round 1 — search the user query verbatim. The corpus is ~95%
        // Turkish, so for non-Turkish questions we ALSO immediately
        // search the Turkish translation. Without this step, an English
        // question like "Why is salah important" misses the bulk of the
        // namaz material because none of those chunks contain the word
        // "salah" verbatim.
        await patchProgress(`Searching: ${args.content}`);
        const r1 = await runOneSearch(args.content);
        queriesTried.add(args.content.toLowerCase());
        stepsAcc.push({ query: args.content, resultCount: r1 });

        if (plannerClient && !looksTurkish(args.content)) {
          const tr = await translateToTurkish(plannerClient, args.content);
          if (tr && !queriesTried.has(tr.toLowerCase())) {
            queriesTried.add(tr.toLowerCase());
            await patchProgress(`Searching (TR): ${tr}`);
            const added = await runOneSearch(tr);
            stepsAcc.push({
              query: tr,
              resultCount: added,
              reasoning:
                "Translated the question to Turkish — the corpus is overwhelmingly Turkish.",
            });
          }
        }

        await patchProgress(`Found ${sourceById.size} sources so far. Planning next searches…`);

        // Rounds 2..N — planner-driven.
        for (let round = 2; round <= AGENTIC_MAX_ROUNDS; round++) {
          if (sourceById.size >= AGENTIC_MAX_SOURCES) break;
          if (!plannerClient) break;
          const plan = await runPlanner(
            plannerClient,
            args.content,
            stepsAcc,
            Array.from(sourceById.values()).slice(-12),
            AGENTIC_MAX_ROUNDS - round + 1,
          );
          if (plan.done || plan.queries.length === 0) break;
          // Filter out queries we already ran (case-insensitive).
          const fresh = plan.queries.filter(
            (q) => q && !queriesTried.has(q.toLowerCase()),
          );
          if (fresh.length === 0) break;
          // Attach the planner's rationale only to the FIRST new query of
          // the round — the same reasoning string applies to all queries
          // the planner returned together, so repeating it on every row
          // is just visual noise.
          let reasoningAttached = false;
          for (const q of fresh) {
            if (sourceById.size >= AGENTIC_MAX_SOURCES) break;
            queriesTried.add(q.toLowerCase());
            await patchProgress(`Searching: ${q}`);
            const added = await runOneSearch(q);
            stepsAcc.push({
              query: q,
              resultCount: added,
              reasoning: reasoningAttached ? undefined : plan.reasoning,
            });
            reasoningAttached = true;
            await patchProgress(`Found ${sourceById.size} sources so far.`);
          }
        }

        await patchProgress(
          `Synthesizing answer from ${sourceById.size} sources across ${stepsAcc.length} searches…`,
        );

        rawSources = Array.from(sourceById.values());
        agenticSteps = stepsAcc;
      } else {
        // ─── Plain single-shot retrieval (original path) ─────────
        try {
          const ragResponse = await fetch(`${ragUrl}/api/search`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(ragKey ? { "X-API-Key": ragKey } : {}),
            },
            body: JSON.stringify({
              query: args.content,
              top_k: 6,
              use_reranker: true,
            }),
          });
          if (ragResponse.ok) {
            const search = await ragResponse.json();
            rawSources = (search.results ?? []) as Array<{
              chunk: Record<string, unknown>;
              score: number;
            }>;
          } else {
            console.warn(
              `RAG API returned ${ragResponse.status}; proceeding without sources`
            );
          }
        } catch (ragErr) {
          console.warn("RAG API unreachable; proceeding without sources:", ragErr);
        }
      }

      // 5. Load prior conversation history. We pull the full message
      // doc (not just role+content) so we can re-attach each prior
      // assistant turn's sources — without this, the LLM is blind to
      // source [N] references the user might make about prior answers,
      // and switching models mid-conversation loses citation continuity.
      //
      // Token-budget tradeoff: the LAST 2 assistant turns get FULL
      // chunk text inlined (so the model can quote/discuss them);
      // older turns get a title-only legend (so the model knows what
      // [N] referred to without paying the full text cost).
      const historyDocs = (await ctx.runQuery(api.queries.messages.byConversation, {
        conversationId: args.conversationId,
      })) as Array<{
        role: string;
        content: string;
        sources?: Array<{
          title?: string;
          author_speaker?: string;
          text?: string;
          chapter_section?: string;
        }>;
      }>;
      // Find which assistant turns are "recent enough" to deserve full
      // text. We walk backwards and mark the last 2 we see.
      const recentAssistantIdx = new Set<number>();
      {
        let seen = 0;
        for (let i = historyDocs.length - 1; i >= 0 && seen < 2; i--) {
          if (historyDocs[i].role === "assistant" && historyDocs[i].sources?.length) {
            recentAssistantIdx.add(i);
            seen++;
          }
        }
      }
      const history = historyDocs.map((m, idx) => {
        if (m.role !== "assistant" || !m.sources || m.sources.length === 0) {
          return { role: m.role, content: m.content };
        }
        if (recentAssistantIdx.has(idx)) {
          // Full inline — the model can re-quote these.
          const block = m.sources
            .slice(0, 36)
            .map((s, i) => {
              const head = `[${i + 1}] ${(s.title ?? "").slice(0, 100)}${
                s.author_speaker ? " — " + s.author_speaker.slice(0, 60) : ""
              }${s.chapter_section ? " · " + s.chapter_section.slice(0, 80) : ""}`;
              const body = (s.text ?? "").slice(0, 1200);
              return `${head}\n${body}`;
            })
            .join("\n\n");
          return {
            role: m.role,
            content: `${m.content}\n\n--- SOURCES FROM THIS TURN ---\n${block}\n--- END SOURCES ---`,
          };
        }
        // Older turn — title-only legend keeps citation references
        // resolvable without flooding the context window.
        const legend = m.sources
          .slice(0, 36)
          .map(
            (s, i) =>
              `[${i + 1}] ${(s.title ?? "").slice(0, 80)}${s.author_speaker ? " — " + s.author_speaker.slice(0, 60) : ""}`,
          )
          .join("\n");
        return {
          role: m.role,
          content: `${m.content}\n\n(Sources from this turn:\n${legend})`,
        };
      });

      // 6. Build the LLM prompt
      const sourceContexts: SourceContext[] = rawSources.map((r, i) => ({
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

      // Pick the lean prompt variant when retrieval returned no sources.
      // Saves ~500 input tokens per call (no source-citation rules), which
      // matters because the no-sources path is the common case while RAG
      // is offline AND for users on long-running conversations where the
      // cache prefix would otherwise dwarf their actual query.
      const hasSources = sourceContexts.length > 0;

      // Detect the user's language from THIS turn (not the conversation
      // history, not the sources). The model otherwise drifts toward
      // Turkish on every reply because the corpus and most history are
      // Turkish. We override that drift with an explicit instruction
      // wrapped around the user query.
      const detectedLang = detectReplyLanguage(args.content);
      const languageDirective =
        `[SYSTEM: The user just wrote in ${detectedLang.label}. ` +
        `You MUST write your ENTIRE reply in ${detectedLang.label}. ` +
        `Do NOT switch to Turkish, Arabic, or any other language even ` +
        `though the source passages are mostly Turkish. Translate any ` +
        `quoted source material into ${detectedLang.label}, but keep ` +
        `the original Turkish/Arabic phrase in parentheses or as a ` +
        `parenthetical when a key term is untranslatable.]\n\n`;

      const promptOpts = {
        sources: sourceContexts,
        query: languageDirective + args.content,
        conversationHistory: history.slice(-MAX_HISTORY),
      };
      const prompt =
        args.model === "claude"
          ? hasSources
            ? buildChatClaudePrompt(promptOpts)
            : buildChatClaudeLeanPrompt(promptOpts)
          : hasSources
            ? buildChatGeminiPrompt(promptOpts)
            : buildChatGeminiLeanPrompt(promptOpts);

      // 7. Resolve API key (BYOK if active, else env)
      const byokKey = await resolveByokKey(ctx, me._id, args.model);

      // 8. Stream the response
      let accumulated = "";
      let lastFlushChars = 0;
      let lastFlushTime = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      // Wall-clock latency for $ai_generation event. Measured around the
      // entire LLM block (initial call + stream consumption + flush).
      const llmStart = Date.now();

      const flush = async (force = false) => {
        const now = Date.now();
        if (!force) {
          if (accumulated.length - lastFlushChars < STREAM_FLUSH_CHARS) return;
          if (now - lastFlushTime < MIN_FLUSH_INTERVAL_MS) return;
        }
        lastFlushChars = accumulated.length;
        lastFlushTime = now;
        await ctx.runMutation(internal.mutations.messages.updateContent, {
          messageId: assistantMsgId,
          content: accumulated,
        });
      };

      if (args.model === "claude") {
        const apiKey = byokKey ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("Anthropic API key not configured");
        const client = new Anthropic({ apiKey });
        const stream = await withLLMRetry(() =>
          client.messages.stream({
            model: resolvedModelId,
            max_tokens: args.agentic ? CLAUDE_MAX_TOKENS_AGENTIC : CLAUDE_MAX_TOKENS,
            messages: toAnthropicMessages(prompt),
          })
        );
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            accumulated += event.delta.text;
            await flush();
          }
        }
        const final = await stream.finalMessage();
        inputTokens = final.usage.input_tokens;
        outputTokens = final.usage.output_tokens;
      } else {
        const apiKey = byokKey ?? process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Gemini API key not configured");
        const client = new GoogleGenAI({ apiKey });
        // Non-streaming + retry. The streaming SDK path was unreliable on
        // free-tier keys (the for-await loop would surface 429s mid-stream
        // wrapped as "exception parsing response", outside the retry guard).
        // A single generateContent call is easier to retry and the user
        // still sees a near-instant response on flash models.
        const result = await withLLMRetry(() =>
          client.models.generateContent({
            model: resolvedModelId,
            contents: prompt.body,
          })
        );
        accumulated = result.text ?? "";
        await flush(true);
        if (result.usageMetadata) {
          inputTokens = result.usageMetadata.promptTokenCount ?? 0;
          outputTokens = result.usageMetadata.candidatesTokenCount ?? 0;
        }
      }

      await flush(true);

      // 8b. Emit $ai_generation event to PostHog. Fire-and-forget — must
      //     not block message finalization.
      captureGeneration({
        distinctId: me._id as string,
        traceId: assistantMsgId as string,
        model: resolvedModelId,
        latencySeconds: (Date.now() - llmStart) / 1000,
        inputTokens,
        outputTokens,
        input: [
          { role: "user", content: prompt.body },
        ],
        output: accumulated,
        properties: {
          source: "chat",
          model_family: args.model,
          model_variant: args.modelVariant ?? null,
          conversation_id: args.conversationId as string,
          agentic: !!args.agentic,
          byok: !!byokKey,
          source_count: rawSources.length,
          plan: me.subscription?.plan ?? null,
        },
      });

      // 9. Persist sources + finalize.
      // The RAG API returns `null` for missing numeric fields (audio chunks
      // have no page_number, text chunks have no timestamps). The Convex
      // schema uses `v.optional(v.number())` which only accepts undefined
      // (or absent), NOT null. Coerce null → undefined before saving.
      //
      // SIZE GUARD: Convex caps documents at 1 MiB. The agentic path can
      // collect up to ~36 sources, and many chunks (especially Risale-i Nur
      // sections) have a `parent_text` of several KB. Together that easily
      // pushes the message past the limit. We always drop parent_text and
      // truncate `text` to a hard cap; the full chunk is still reachable
      // via the source viewer link.
      const num = (v: unknown): number | undefined =>
        typeof v === "number" ? v : undefined;
      const TEXT_CAP = args.agentic ? 1200 : 4000;
      const truncate = (s: string) =>
        s.length > TEXT_CAP ? s.slice(0, TEXT_CAP) + "…" : s;
      const sourcePayload = rawSources.map((r) => ({
        chunk_id: String(r.chunk.chunk_id ?? ""),
        doc_id: String(r.chunk.doc_id ?? ""),
        text: truncate(String(r.chunk.text ?? "")),
        // parent_text is intentionally omitted on the persisted payload —
        // it's only useful in the live retrieval-time prompt, not in the
        // stored conversation record, and it's the single biggest field
        // by size.
        source_type: String(r.chunk.source_type ?? "text"),
        language: String(r.chunk.language ?? "tr"),
        collection: String(r.chunk.collection ?? ""),
        title: String(r.chunk.title ?? "").slice(0, 200),
        author_speaker: String(r.chunk.author_speaker ?? "").slice(0, 120),
        publisher: String(r.chunk.publisher ?? "").slice(0, 120),
        chapter_section: String(r.chunk.chapter_section ?? "").slice(0, 200),
        page_number: num(r.chunk.page_number),
        timestamp_start: num(r.chunk.timestamp_start),
        timestamp_end: num(r.chunk.timestamp_end),
        score: r.score,
      }));

      await ctx.runMutation(internal.mutations.messages.finalize, {
        messageId: assistantMsgId,
        content: accumulated,
        sources: sourcePayload,
      });

      // Persist the agentic plan alongside the final answer. We do this
      // as a separate patch (rather than threading it through finalize)
      // so the change stays localized: finalize is shared with the
      // single-shot path and we don't want to bloat its arg surface.
      if (agenticSteps && agenticSteps.length > 0) {
        await ctx.runMutation(internal.mutations.messages.updateAgenticProgress, {
          messageId: assistantMsgId,
          agenticSteps,
          agenticStatus: undefined,
        });
      }

      // 10. Track token usage (skip when BYOK is active)
      if (!byokKey && (inputTokens || outputTokens)) {
        await ctx.runMutation(internal.mutations.usage.trackUsage, {
          userId: me._id,
          model: args.model,
          tokensConsumed: inputTokens + outputTokens,
        });
      }

      return assistantMsgId;
    } catch (error) {
      console.error("chat.sendMessage failed", error);
      // Capture the failed generation so we can see error rate / message
      // in PostHog LLM Analytics. distinctId may not exist yet if we
      // failed before loading `me`, so default to anonymous.
      captureGeneration({
        distinctId: (me?._id as string) ?? "anonymous",
        traceId: assistantMsgId as string,
        model: args.modelVariant ?? args.model,
        latencySeconds: 0,
        inputTokens: 0,
        outputTokens: 0,
        input: [{ role: "user", content: args.content }],
        output: "",
        isError: true,
        errorMessage: error instanceof Error ? error.message : String(error),
        properties: {
          source: "chat",
          model_family: args.model,
          model_variant: args.modelVariant ?? null,
          conversation_id: args.conversationId as string,
          agentic: !!args.agentic,
        },
      });
      await ctx.runMutation(internal.mutations.messages.finalize, {
        messageId: assistantMsgId,
        content:
          "Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin. (" +
          (error instanceof Error ? error.message : "unknown") +
          ")",
      });
      return assistantMsgId;
    }
  },
});

/** Look up a per-user API key for the chosen model. Returns null if BYOK is off. */
async function resolveByokKey(
  ctx: ActionCtx,
  userId: string,
  model: "claude" | "gemini"
): Promise<string | null> {
  const key = await ctx.runQuery(internal.byok.getActiveKey, {
    userId: userId as any,
    model,
  });
  return key ?? null;
}

/**
 * Run an LLM call with bounded retries on transient errors.
 *
 * Retries on:
 *  - HTTP 429 (rate limited)
 *  - HTTP 503 / "overloaded" (provider capacity)
 *  - Anthropic SDK `OverloadedError` / `RateLimitError`
 *  - Network errors (no status code)
 *
 * Backoff: 1s, then 3s. Total worst-case wait ≈ 4s before surfacing the
 * error to the caller.
 */
async function withLLMRetry<T>(fn: () => T | Promise<T>): Promise<T> {
  const delays = [1000, 3000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= LLM_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientLLMError(err) || attempt === LLM_RETRY_ATTEMPTS) {
        throw err;
      }
      const wait = delays[attempt] ?? 3000;
      console.warn(
        `LLM call failed (attempt ${attempt + 1}), retrying in ${wait}ms:`,
        err instanceof Error ? err.message : err
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/**
 * Ask Gemini Flash Lite to plan the next batch of search queries for
 * agentic chat. The planner sees the user's original question, the
 * search history, and a snapshot of the most recently retrieved
 * sources, then returns either {done: true} or 1-3 fresh queries.
 *
 * Cost: ~1k input tokens × Flash Lite ≈ $0.0002 per planning call.
 * On a 6-round search that's ~$0.001 in planner cost — negligible.
 */
async function runPlanner(
  client: GoogleGenAI,
  userQuery: string,
  stepsSoFar: Array<{ query: string; resultCount: number; reasoning?: string }>,
  recentSources: Array<{ chunk: Record<string, unknown> }>,
  roundsRemaining: number,
): Promise<{ done: boolean; queries: string[]; reasoning?: string }> {
  // Compact source summary — title + first 200 chars of text. We don't
  // need the full chunks; the planner just needs enough signal to spot
  // gaps in coverage.
  const sourceLines = recentSources.map((r, i) => {
    const title = String(r.chunk.title ?? "").slice(0, 60);
    const author = String(r.chunk.author_speaker ?? "").slice(0, 30);
    const snippet = String(r.chunk.text ?? "").replace(/\s+/g, " ").slice(0, 180);
    return `${i + 1}. [${title}${author ? " — " + author : ""}] ${snippet}`;
  });

  const historyLines = stepsSoFar.map(
    (s) => `- "${s.query}" → ${s.resultCount} new sources`,
  );
  // Surface the reasoning the planner already issued so it doesn't keep
  // re-stating the same gap analysis on every round. Each round the
  // planner emits one rationale string that's stored on the first query
  // of the round; we collect those.
  const priorReasonings = stepsSoFar
    .map((s) => s.reasoning)
    .filter((r): r is string => typeof r === "string" && r.length > 0);

  const prompt =
    "You are a research planner for a hybrid-search RAG system over a " +
    "Turkish Islamic scholarship corpus: Risale-i Nur, Fethullah Gülen's " +
    "writings, Hizmet movement publications, and transcribed audio " +
    "lessons. The corpus is ~95% Turkish.\n\n" +
    "HOW THE RETRIEVAL ACTUALLY WORKS — read this carefully, it changes " +
    "what 'good' queries look like:\n" +
    "- Hybrid: dense vectors (Gemini Embed 2, 3072d) + BM25 sparse + RRF " +
    "fusion + a cross-encoder reranker.\n" +
    "- Dense retrieval matches PASSAGES against PASSAGES. The closer your " +
    "query looks to how the source text actually phrases the idea, the " +
    "better. A natural-sounding declarative sentence beats a keyword " +
    "soup. A direct quote that might appear verbatim is gold.\n" +
    "- BM25 catches rare/specific terminology — proper nouns, distinctive " +
    "terms, Arabic loanwords. So including ONE specific term (e.g. " +
    "'miraç', 'ma'rifetullah', 'sıdk') sharpens recall.\n" +
    "- The corpus is already 95% Turkish Islamic scholarship — there is " +
    "no need to append 'risale-i nur' / 'bediüzzaman' / 'hizmet' as " +
    "metadata tags to every query. Doing so wastes BM25 weight on words " +
    "that appear in nearly every chunk, AND degrades the dense vector " +
    "by injecting topic noise. Attribution belongs in the query ONLY " +
    "when you specifically want a passage by/about that figure.\n\n" +
    "WRITE QUERIES THAT:\n" +
    "1. Look like a sentence the source might actually contain. E.g. " +
    "instead of 'namaz önemi risale-i nur', try 'namaz dinin direğidir' " +
    "or 'namaz müminin miracıdır' — these are phrases scholars actually " +
    "write, so dense retrieval lights up.\n" +
    "2. Use the corpus's own vocabulary. 'namaz' not 'salah'. 'iman' not " +
    "'faith'. 'marifetullah' not 'knowing God'. 'fariza' not 'religious " +
    "duty'. 'tevhid' not 'monotheism'. 'sünnet' not 'tradition'.\n" +
    "3. Vary the angle each round. Round 2 might be a definition, round " +
    "3 a specific scholar's framing, round 4 a related Quranic concept, " +
    "round 5 a counter-argument or common misunderstanding. Do NOT just " +
    "rephrase prior searches.\n" +
    "4. Try at least one direct-quote-style query — a phrase that might " +
    "appear verbatim in a source ('namaz mü'minin miracıdır', " +
    "'\"hayy\" ismi', 'iman bir nurdur').\n\n" +
    `User's original question: ${userQuery}\n\n` +
    `Searches already run:\n${historyLines.join("\n") || "(none)"}\n\n` +
    (priorReasonings.length > 0
      ? `Your prior gap analysis (do NOT repeat these — say something new):\n${priorReasonings.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\n`
      : "") +
    `Most recent sources retrieved (titles + snippets):\n${sourceLines.join("\n") || "(none)"}\n\n` +
    `Rounds remaining: ${roundsRemaining}.\n\n` +
    "Decide: do we have enough material, or do we need follow-up " +
    "searches that explore a genuinely new angle the existing sources " +
    "do not yet cover?\n\n" +
    "Respond with STRICT JSON only — no markdown, no prose around it. " +
    "Schema:\n" +
    `{"done": boolean, "reasoning": string, "queries": string[]}\n\n` +
    "If done is true, leave queries empty. Otherwise list 1-3 short, " +
    "natural Turkish queries that mimic how source text would phrase " +
    'the idea. Example: {"done": false, ' +
    '"reasoning": "Have general importance but no source on namaz as miraç — ' +
    'a core Risale framing", ' +
    '"queries": ["namaz mü\'minin miracıdır", "miraç nurani helezon", "namaz manevi terakki vesilesi"]}.';

  try {
    const result = await client.models.generateContent({
      model: AGENTIC_PLANNER_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.3, maxOutputTokens: 512 },
    });
    const text = (result.text ?? "").trim();
    // Strip a ```json fence if the model insisted on adding one despite
    // the instructions.
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      done?: boolean;
      reasoning?: string;
      queries?: unknown;
    };
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries.filter((q): q is string => typeof q === "string" && q.length > 0).slice(0, 3)
      : [];
    return {
      done: parsed.done === true,
      queries,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
    };
  } catch (e) {
    console.warn("planner call failed; ending agentic loop:", e);
    return { done: true, queries: [] };
  }
}

/**
 * Cheap heuristic for "is this query already Turkish?" — looks for any
 * Turkish-specific diacritic. Misses pure-ASCII Turkish words like
 * "namaz", but those slip through to the FastAPI cross-lingual path
 * anyway and don't hurt retrieval. We only need to catch obviously
 * English / non-Turkish queries here so we know to translate them.
 */
function looksTurkish(s: string): boolean {
  return /[ıİğĞşŞçÇöÖüÜ]/.test(s);
}

/**
 * Detect the reply language for a user message. The chat LLM otherwise
 * drifts to Turkish on every turn because the corpus, history, and
 * most sources are Turkish — we have to give it an explicit
 * "reply in X" instruction. Returns a code + a human label suitable
 * for splicing into a prompt.
 *
 * The detection is intentionally simple: Arabic-script glyphs → Arabic,
 * Turkish diacritics OR a Turkish stopword → Turkish, otherwise English.
 * Anything weirder (French, Indonesian) falls through to English; that's
 * fine for now since the actual user base is TR/EN/AR.
 */
function detectReplyLanguage(text: string): { code: "tr" | "en" | "ar"; label: string } {
  const t = text || "";
  if (/[\u0600-\u06FF]/.test(t)) return { code: "ar", label: "Arabic" };
  if (
    /[ıİğĞşŞçÇöÖüÜ]/.test(t) ||
    /\b(ve|bir|için|nedir|nasıl|hangi|olan|neden|olarak|hakkında)\b/i.test(t)
  ) {
    return { code: "tr", label: "Turkish" };
  }
  return { code: "en", label: "English" };
}

/**
 * Translate a non-Turkish question to Turkish via Gemini Flash Lite,
 * using the religious/scholarly vocabulary the corpus actually uses
 * (e.g. "namaz" not "salat", "iman" not "inanç"). Returns null on
 * any error so the caller can fall back gracefully.
 */
async function translateToTurkish(
  client: GoogleGenAI,
  query: string,
): Promise<string | null> {
  try {
    const result = await client.models.generateContent({
      model: AGENTIC_PLANNER_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Translate the following question to Turkish. Use the " +
                "Islamic/scholarly Turkish vocabulary that Risale-i Nur " +
                'and Fethullah Gülen use ("namaz" not "salat", "iman" ' +
                'not "inanç", "marifetullah" not "Allah\'ı bilme"). ' +
                "Return ONLY the Turkish translation — no quotes, no " +
                "explanation, no preface.\n\n" +
                `Question: ${query}`,
            },
          ],
        },
      ],
      config: { temperature: 0, maxOutputTokens: 200 },
    });
    const out = (result.text ?? "").trim().replace(/^["']|["']$/g, "");
    return out || null;
  } catch (e) {
    console.warn("translateToTurkish failed:", e);
    return null;
  }
}

function isTransientLLMError(err: unknown): boolean {
  if (!err) return false;
  // Anthropic SDK error classes have a `status` field
  const status =
    (err as { status?: number; statusCode?: number }).status ??
    (err as { status?: number; statusCode?: number }).statusCode;
  if (status === 429 || status === 503 || status === 529) return true;

  const message =
    err instanceof Error
      ? err.message.toLowerCase()
      : String(err).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("overloaded") ||
    message.includes("503") ||
    message.includes("temporarily unavailable")
  );
}
