/**
 * Chat action — RAG retrieval + LLM streaming.
 *
 * Two modes:
 *
 *  PLAIN (default):
 *   1. Verify user, save user message
 *   2. Create assistant placeholder (isStreaming: true)
 *   3. Retrieve sources via FastAPI /api/search (single-shot)
 *   4. Stream LLM response from Anthropic (Claude) or Google GenAI
 *      (Gemini), patching the assistant message after each chunk so the
 *      web client's reactive query updates in real time
 *   5. Finalize message with sources + tracked token usage
 *
 *  AGENTIC (args.agentic — "Deep research"):
 *   A Claude Sonnet 5 tool loop over the five corpus tools on the
 *   Hetzner tool server (search_corpus / search_text / list_works /
 *   get_work_outline / read_document). The loop streams a per-round
 *   research timeline into `messages.researchSteps`, then streams the
 *   final synthesis into `content` and emits model-selected citations
 *   into `sources`. Replaces the old Gemini-Flash-Lite planner mode
 *   (whose `agenticSteps` field remains only for historical messages).
 *
 * BYOK: if the user has saved their own API key in `apiKeys` and `isActive`,
 *       it overrides the platform-wide env key for the chosen model.
 */
"use node";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
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
  RESEARCH_AGENT_SYSTEM,
  type SourceContext,
} from "../lib/prompts";
import {
  RESEARCH_TOOLS,
  executeResearchTool,
  summarizeToolInput,
  type DocRegistry,
} from "../lib/agentTools";
import {
  DAILY_LIMITS,
  ESTIMATED_RESEARCH_ANSWER_TOKENS,
} from "../lib/planLimits";
import { resolveModelId } from "../lib/modelCatalog";
import { captureGeneration } from "../lib/llmAnalytics";

const MAX_HISTORY = 10;
// Conservative output cap for plain chat. Chat replies almost never need
// more than 1k tokens; capping here protects against runaway generations
// on a stuck stream and aligns with Sonnet's pricing curve.
const CLAUDE_MAX_TOKENS = 1024;
const LLM_RETRY_ATTEMPTS = 2; // 1 initial try + up to 2 retries on transient errors
// Stream flush throttle. We patch the streaming message at most once per
// MIN_FLUSH_INTERVAL_MS milliseconds, with an additional minimum of
// STREAM_FLUSH_CHARS new characters since the last flush. This coalesces
// the burst of small tokens that LLMs emit while still feeling like real
// streaming to the user.
const STREAM_FLUSH_CHARS = 32;
const MIN_FLUSH_INTERVAL_MS = 80;

// ── Research agent (Sonnet 5 tool loop) caps ─────────────────────────
// The loop model is fixed regardless of the user's variant pick — the
// research loop is tuned (prompt, tools, caching) for Sonnet 5.
const RESEARCH_MODEL = "claude-sonnet-5";
// Thinking + text share max_tokens on Sonnet 5 (adaptive thinking is on
// by default); 2048 would truncate syntheses mid-thought.
const RESEARCH_MAX_TOKENS = 16_000;
// Hard ceiling on executed tool calls per answer.
const RESEARCH_MAX_TOOL_CALLS = 16;
// Wall-clock budget. Convex node actions hard-cap at 10 minutes with no
// retry; past this budget we inject a user-turn instruction to synthesize
// with what the model already has.
const RESEARCH_WALL_CLOCK_MS = 6.5 * 60 * 1000;
// Safety cap on API rounds (a round may contain several parallel calls).
const RESEARCH_MAX_ROUNDS = 20;

export const sendMessage = action({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    model: v.union(v.literal("gemini"), v.literal("claude")),
    /** Optional specific variant within the family (e.g. "claude-opus-4-5",
     *  "gemini-2.5-flash-lite"). Falls back to the family default. */
    modelVariant: v.optional(v.string()),
    /** Deep-research mode. When true the action runs the Claude Sonnet 5
     *  tool loop over the corpus tools (regardless of the selected model
     *  family — the loop model is always Sonnet 5, and usage counts
     *  against the Claude budget). */
    agentic: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"messages">> => {
    // 1. Verify auth + load user (which includes the live subscription).
    // Explicit type annotation breaks the TS circularity that arises from
    // cross-file api references (per Convex guidelines on runQuery/runMutation).
    const me: any = await ctx.runQuery(api.users.me, {});
    if (!me) throw new Error("Not authenticated");

    // Deep research always runs on Claude — budget, BYOK, and usage
    // tracking follow the model that actually executes.
    const effectiveFamily: "gemini" | "claude" = args.agentic
      ? "claude"
      : args.model;

    // 1b. Server-side budget enforcement — refuse if the user is out of
    //     tokens AND has no BYOK key for the chosen model. The web also
    //     checks this, but we re-verify here so a malicious client cannot
    //     bypass the limit by calling the action directly.
    const sub = me.subscription;
    const byokActive = me.byokActive;
    if (!byokActive && sub) {
      const isClaude = effectiveFamily === "claude";
      const used = isClaude ? sub.claudeTokensUsed : sub.geminiTokensUsed;
      const limit = isClaude ? sub.claudeTokensLimit : sub.geminiTokensLimit;
      const credit = isClaude
        ? sub.claudeCreditTokens ?? 0
        : sub.geminiCreditTokens ?? 0;
      if (used >= limit && credit <= 0) {
        throw new ConvexError(
          `Token budget exhausted for ${effectiveFamily}. Upgrade your plan, buy a credit pack, or add your own API key in Settings.`
        );
      }

      // Deep research pre-flight: one answer costs ~90K billing-equivalent
      // tokens. Refuse up front when the remaining monthly allotment (plus
      // credits) can't cover it, instead of starting a 60s research run
      // that would massively overdraw the budget.
      if (args.agentic) {
        const remainingMonthly = Math.max(0, limit - used) + credit;
        if (remainingMonthly < ESTIMATED_RESEARCH_ANSWER_TOKENS) {
          throw new ConvexError(
            `Not enough Claude tokens left for a deep research answer (needs ~${Math.round(ESTIMATED_RESEARCH_ANSWER_TOKENS / 1000)}K, ${Math.round(remainingMonthly / 1000)}K remaining). Upgrade your plan, buy a credit pack, or add your own Anthropic API key in Settings.`
          );
        }
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
          throw new ConvexError(
            `Daily token cap reached for ${effectiveFamily}. Resets in a few hours, or buy a credit pack / use your own API key.`
          );
        }
      }
    }

    // Resolve the user's variant pick to an actual SDK model id. The
    // research loop ignores the variant — it is tuned for Sonnet 5.
    const resolvedModelId = args.agentic
      ? RESEARCH_MODEL
      : resolveModelId(args.model, args.modelVariant);

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
        model: effectiveFamily,
        modelVariant: resolvedModelId,
        isStreaming: true,
      }
    );

    try {
      // ─── Agentic deep-research path (Sonnet 5 tool loop) ───────
      if (args.agentic) {
        const byokKey = await resolveByokKey(ctx, me._id, "claude");
        const apiKey = byokKey ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("Anthropic API key not configured");

        const history = await loadConversationHistory(ctx, args.conversationId);
        const llmStart = Date.now();
        const result = await runResearchAgent({
          ctx,
          assistantMsgId,
          apiKey,
          question: args.content,
          history,
        });

        captureGeneration({
          distinctId: me._id as string,
          traceId: assistantMsgId as string,
          model: RESEARCH_MODEL,
          latencySeconds: (Date.now() - llmStart) / 1000,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          input: [{ role: "user", content: args.content }],
          output: result.content,
          properties: {
            source: "chat",
            model_family: "claude",
            model_variant: RESEARCH_MODEL,
            conversation_id: args.conversationId as string,
            agentic: true,
            byok: !!byokKey,
            source_count: result.sources.length,
            tool_calls: result.usage.toolCalls,
            loop_rounds: result.usage.rounds,
            cache_read_tokens: result.usage.cacheReadTokens,
            cache_creation_tokens: result.usage.cacheCreationTokens,
            plan: me.subscription?.plan ?? null,
          },
        });

        await ctx.runMutation(internal.mutations.messages.finalize, {
          messageId: assistantMsgId,
          content: result.content,
          sources: result.sources,
        });

        // Track token usage across ALL loop rounds (skip when BYOK).
        // inputTokens includes cache reads/writes at face value; passing
        // the cache split lets trackUsage charge the billing-equivalent
        // amount (reads x0.1, writes x1.25) against the quota while
        // analytics above keep the raw numbers.
        if (
          !byokKey &&
          (result.usage.inputTokens || result.usage.outputTokens)
        ) {
          await ctx.runMutation(internal.mutations.usage.trackUsage, {
            userId: me._id,
            model: "claude",
            tokensConsumed:
              result.usage.inputTokens + result.usage.outputTokens,
            cacheReadTokens: result.usage.cacheReadTokens,
            cacheCreationTokens: result.usage.cacheCreationTokens,
          });
        }

        return assistantMsgId;
      }

      // ─── Plain single-shot path ────────────────────────────────
      //
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

      // 5. Load prior conversation history (see loadConversationHistory).
      const history = await loadConversationHistory(ctx, args.conversationId);

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

      const languageDirective = buildLanguageDirective(args.content);

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
            max_tokens: CLAUDE_MAX_TOKENS,
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
          agentic: false,
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
      // SIZE GUARD: Convex caps documents at 1 MiB. Many chunks (especially
      // Risale-i Nur sections) have a `parent_text` of several KB. We always
      // drop parent_text and truncate `text` to a hard cap; the full chunk
      // is still reachable via the source viewer link.
      const num = (v: unknown): number | undefined =>
        typeof v === "number" ? v : undefined;
      const TEXT_CAP = 4000;
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
          model_family: effectiveFamily,
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

// ── Research agent loop ────────────────────────────────────────────────

interface ResearchStep {
  tool: string;
  inputSummary: string;
  resultCount?: number;
  elapsedMs?: number;
  isError?: boolean;
  ts: number;
}

interface ResearchUsage {
  /** Total prompt tokens across all rounds — uncached + cache writes +
   *  cache reads, at face value (T6 owns re-weighting cached tokens). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  rounds: number;
  toolCalls: number;
}

type ResearchSourcePayload = {
  chunk_id: string;
  doc_id: string;
  text: string;
  source_type: string;
  language: string;
  collection: string;
  title: string;
  author_speaker: string;
  publisher: string;
  chapter_section: string;
  page_number?: number;
  timestamp_start?: number;
  timestamp_end?: number;
  passage_start?: number;
  passage_end?: number;
};

interface ResearchResult {
  content: string;
  sources: ResearchSourcePayload[];
  steps: ResearchStep[];
  usage: ResearchUsage;
}

/**
 * Run the Claude Sonnet 5 tool loop for one question.
 *
 * Loop mechanics (per the agentic-retrieval tech plan):
 *  - adaptive thinking on by default (no `thinking` param), no sampling
 *    params (400 on Sonnet 5), max_tokens 16K shared by thinking + text;
 *  - prompt caching: one breakpoint on the last system block (system +
 *    tools cached together — both byte-stable) and a moving breakpoint on
 *    the last content block of the latest appended message;
 *  - caps: RESEARCH_MAX_TOOL_CALLS executed tool calls or
 *    RESEARCH_WALL_CLOCK_MS, after which a user-turn note instructs the
 *    model to synthesize with what it has;
 *  - tool errors come back as is_error tool_results (never dropped); all
 *    results of a parallel round go back in ONE user message;
 *  - per-round usage (incl. cache split) is logged and summed.
 *
 * `simulateCrashAfterRound` is a test hook (see researchLoopTest): the
 * loop throws after N completed rounds so the watchdog cron path can be
 * exercised deterministically.
 */
async function runResearchAgent(opts: {
  ctx: ActionCtx;
  assistantMsgId: Id<"messages">;
  apiKey: string;
  question: string;
  history: Array<{ role: string; content: string }>;
  simulateCrashAfterRound?: number;
}): Promise<ResearchResult> {
  const { ctx, assistantMsgId, question } = opts;
  const ragUrl = process.env.RAG_API_URL ?? "http://localhost:8000";
  const ragKey = process.env.RAG_API_KEY ?? "";
  const client = new Anthropic({ apiKey: opts.apiKey });
  const startedAt = Date.now();

  // ── Conversation state ──
  const registry: DocRegistry = new Map();
  const steps: ResearchStep[] = [];
  const usage: ResearchUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    rounds: 0,
    toolCalls: 0,
  };

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: RESEARCH_AGENT_SYSTEM,
      cache_control: { type: "ephemeral" },
    },
  ];

  const messages: Anthropic.MessageParam[] = [];
  for (const m of opts.history) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (!m.content.trim()) continue;
    messages.push({ role: m.role, content: m.content });
  }
  // Drop the just-saved copy of the current user turn (it is re-added
  // below with the language directive), and any leading assistant turns
  // (Anthropic requires the first message to be from the user).
  while (
    messages.length > 0 &&
    messages[messages.length - 1].role === "user" &&
    messages[messages.length - 1].content === question
  ) {
    messages.pop();
  }
  while (messages.length > 0 && messages[0].role === "assistant") {
    messages.shift();
  }
  messages.push({
    role: "user",
    content: [{ type: "text", text: buildLanguageDirective(question) + question }],
  });

  // Moving cache breakpoint: strip any previous marker from message
  // blocks, then mark the last block of the latest message. Combined
  // with the system-block marker that's 2 of the 4 allowed breakpoints.
  const setMovingCacheBreakpoint = () => {
    for (const m of messages) {
      if (!Array.isArray(m.content)) continue;
      for (const b of m.content) {
        if (b && typeof b === "object" && "cache_control" in b) {
          delete (b as { cache_control?: unknown }).cache_control;
        }
      }
    }
    const last = messages[messages.length - 1];
    if (last && Array.isArray(last.content) && last.content.length > 0) {
      const block = last.content[last.content.length - 1] as {
        type?: string;
        cache_control?: { type: "ephemeral" };
      };
      // Text and tool_result blocks are cacheable; thinking blocks are not.
      if (block.type === "text" || block.type === "tool_result") {
        block.cache_control = { type: "ephemeral" };
      }
    }
  };

  // ── Streaming content flush (throttled, hides the <sources> block) ──
  let accumulated = "";
  let lastFlushLen = 0;
  let lastFlushTime = 0;
  const flushContent = async (force = false) => {
    const visible = stripSourcesBlock(accumulated);
    const now = Date.now();
    if (!force) {
      if (visible.length - lastFlushLen < STREAM_FLUSH_CHARS) return;
      if (now - lastFlushTime < MIN_FLUSH_INTERVAL_MS) return;
    }
    lastFlushLen = visible.length;
    lastFlushTime = now;
    await ctx.runMutation(internal.mutations.messages.updateContent, {
      messageId: assistantMsgId,
      content: visible,
    });
  };

  const patchProgress = async (status?: string) => {
    try {
      await ctx.runMutation(internal.mutations.messages.updateResearchProgress, {
        messageId: assistantMsgId,
        researchStatus: status ?? "",
        researchSteps: steps,
      });
    } catch (e) {
      console.warn("research progress patch failed:", e);
    }
  };

  await patchProgress("Researching…");

  let budgetNoteInjected = false;
  let finalText = "";

  for (let round = 1; round <= RESEARCH_MAX_ROUNDS; round++) {
    setMovingCacheBreakpoint();

    const stream = await withLLMRetry(() =>
      client.messages.stream({
        model: RESEARCH_MODEL,
        max_tokens: RESEARCH_MAX_TOKENS,
        system,
        tools: RESEARCH_TOOLS,
        messages,
      })
    );

    // Stream this round's text. Intermediate rounds may narrate briefly;
    // each round replaces the visible content, so the final synthesis
    // ends up as the message body.
    accumulated = "";
    lastFlushLen = 0;
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        accumulated += event.delta.text;
        await flushContent();
      }
    }
    const final = await stream.finalMessage();

    usage.rounds = round;
    usage.inputTokens +=
      final.usage.input_tokens +
      (final.usage.cache_creation_input_tokens ?? 0) +
      (final.usage.cache_read_input_tokens ?? 0);
    usage.outputTokens += final.usage.output_tokens;
    usage.cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;
    usage.cacheCreationTokens += final.usage.cache_creation_input_tokens ?? 0;
    console.log(
      `research round ${round}: stop=${final.stop_reason} ` +
        `in=${final.usage.input_tokens} out=${final.usage.output_tokens} ` +
        `cache_read=${final.usage.cache_read_input_tokens ?? 0} ` +
        `cache_write=${final.usage.cache_creation_input_tokens ?? 0} ` +
        `tool_calls_used=${usage.toolCalls} elapsed_ms=${Date.now() - startedAt}`
    );

    if (final.stop_reason !== "tool_use") {
      finalText = accumulated;
      break;
    }

    const toolUses = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (toolUses.length === 0) {
      finalText = accumulated;
      break;
    }

    // Echo the assistant turn back verbatim (thinking blocks included —
    // required for multi-turn tool use on Sonnet 5).
    messages.push({
      role: "assistant",
      content: final.content as unknown as Anthropic.ContentBlockParam[],
    });

    const budgetExhausted =
      usage.toolCalls >= RESEARCH_MAX_TOOL_CALLS ||
      Date.now() - startedAt >= RESEARCH_WALL_CLOCK_MS;

    // Execute all of the round's calls in parallel; failed calls become
    // is_error results, never dropped. Once the budget is exhausted the
    // calls are refused (also as is_error results).
    const executions = await Promise.all(
      toolUses.map(async (tu) => {
        const input = (tu.input ?? {}) as Record<string, unknown>;
        const t0 = Date.now();
        if (budgetExhausted) {
          return {
            tu,
            input,
            exec: {
              resultText:
                "Research budget exhausted — no more tool calls are allowed. Write your final answer now with the material already gathered.",
              isError: true,
            },
            elapsedMs: 0,
          };
        }
        const exec = await executeResearchTool(
          ragUrl,
          ragKey,
          tu.name,
          input,
          registry
        );
        return { tu, input, exec, elapsedMs: Date.now() - t0 };
      })
    );

    if (!budgetExhausted) usage.toolCalls += toolUses.length;

    // Timeline: one entry per executed call, one patch per round.
    let lastSummary = "";
    for (const { tu, input, exec, elapsedMs } of executions) {
      const inputSummary = summarizeToolInput(tu.name, input, registry);
      lastSummary = `${tu.name}: ${inputSummary}`;
      steps.push({
        tool: tu.name,
        inputSummary,
        resultCount: "resultCount" in exec ? exec.resultCount : undefined,
        elapsedMs,
        isError: exec.isError || undefined,
        ts: Date.now(),
      });
    }
    await patchProgress(lastSummary);

    const resultBlocks: Anthropic.ContentBlockParam[] = executions.map(
      ({ tu, exec }) => ({
        type: "tool_result" as const,
        tool_use_id: tu.id,
        content: exec.resultText,
        ...(exec.isError ? { is_error: true } : {}),
      })
    );

    const overBudgetNow =
      usage.toolCalls >= RESEARCH_MAX_TOOL_CALLS ||
      Date.now() - startedAt >= RESEARCH_WALL_CLOCK_MS;
    if (overBudgetNow && !budgetNoteInjected) {
      budgetNoteInjected = true;
      resultBlocks.push({
        type: "text",
        text:
          "[SYSTEM NOTE] The research budget (tool calls / wall-clock time) is now exhausted. " +
          "Do NOT call any more tools. Write your final answer in the user's language using only the material you have already gathered, " +
          "followed by the required <sources> block.",
      });
    }

    messages.push({ role: "user", content: resultBlocks });

    if (opts.simulateCrashAfterRound && round >= opts.simulateCrashAfterRound) {
      throw new Error(
        `Simulated mid-loop crash after round ${round} (test hook)`
      );
    }

    if (round === RESEARCH_MAX_ROUNDS) {
      // Safety cap hit without a natural stop — keep whatever narration
      // we have rather than leaving the message empty.
      finalText = accumulated;
    }
  }

  await patchProgress("");

  const { display, sources } = extractResearchSources(finalText, registry);
  await ctx.runMutation(internal.mutations.messages.updateContent, {
    messageId: assistantMsgId,
    content: display,
  });

  console.log(
    `research done: rounds=${usage.rounds} tool_calls=${usage.toolCalls} ` +
      `in=${usage.inputTokens} out=${usage.outputTokens} ` +
      `cache_read=${usage.cacheReadTokens} cache_write=${usage.cacheCreationTokens} ` +
      `sources=${sources.length} elapsed_ms=${Date.now() - startedAt}`
  );

  return { content: display, sources, steps, usage };
}

/**
 * Hide the machine-read `<sources>…</sources>` block (and any partially
 * streamed prefix of its opening tag) from the user-visible content.
 */
function stripSourcesBlock(text: string): string {
  const idx = text.indexOf("<sources>");
  if (idx !== -1) return text.slice(0, idx).trimEnd();
  // While streaming, the opening tag may be mid-flight — trim a trailing
  // partial prefix like "<sou" so it never flashes in the UI.
  const open = "<sources>";
  for (let n = open.length - 1; n >= 1; n--) {
    if (text.endsWith(open.slice(0, n))) return text.slice(0, -n).trimEnd();
  }
  return text;
}

/**
 * Parse the model's final `<sources>` block into the persisted source
 * payload, enriching each entry with tool-observed work metadata (the
 * model is trusted for n/doc_id/locator/quote; title/author/collection
 * come from the doc registry when available).
 */
function extractResearchSources(
  raw: string,
  registry: DocRegistry
): { display: string; sources: ResearchSourcePayload[] } {
  const display = stripSourcesBlock(raw);
  const m = raw.match(/<sources>\s*([\s\S]*?)\s*<\/sources>/);
  if (!m) return { display, sources: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1]);
  } catch (e) {
    console.warn("research sources block did not parse as JSON:", e);
    return { display, sources: [] };
  }
  if (!Array.isArray(parsed)) return { display, sources: [] };

  const entries = (parsed as Array<Record<string, unknown>>)
    .filter((s) => s && typeof s === "object" && typeof s.doc_id === "string")
    .sort((a, b) => Number(a.n ?? 0) - Number(b.n ?? 0));

  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  const sources: ResearchSourcePayload[] = entries.map((s, i) => {
    const docId = String(s.doc_id);
    const meta = registry.get(docId);
    const loc = (s.locator ?? {}) as Record<string, unknown>;
    const passageStart = num(loc.passage_start);
    const passageEnd = num(loc.passage_end) ?? passageStart;
    const pageStart = num(loc.page_start);
    const pageEnd = num(loc.page_end);
    const tsStart = num(loc.timestamp_start);

    // Human-readable locator for today's renderer (T5 reworks chips).
    const locBits: string[] = [];
    if (pageStart != null) {
      locBits.push(pageEnd != null && pageEnd !== pageStart ? `s. ${pageStart}–${pageEnd}` : `s. ${pageStart}`);
    }
    if (passageStart != null) {
      locBits.push(
        passageEnd != null && passageEnd !== passageStart
          ? `§${passageStart}–${passageEnd}`
          : `§${passageStart}`
      );
    }

    return {
      chunk_id: `research:${docId}:${s.n ?? i + 1}`,
      doc_id: docId,
      text: String(s.quote ?? "").slice(0, 400),
      source_type: meta?.source_type ?? "text",
      language: meta?.language ?? "tr",
      collection: meta?.collection ?? "",
      title: String(meta?.title ?? s.title ?? "").slice(0, 200),
      author_speaker: String(meta?.author_speaker ?? s.author ?? "").slice(0, 120),
      publisher: (meta?.publisher ?? "").slice(0, 120),
      chapter_section: locBits.join(" · ").slice(0, 200),
      page_number: pageStart,
      timestamp_start: tsStart,
      passage_start: passageStart,
      passage_end: passageEnd,
    };
  });

  return { display, sources };
}

// ── Internal test harness ──────────────────────────────────────────────

/**
 * Headless E2E harness for the research loop (dev verification — see
 * ticket T4). Bypasses Clerk auth and budget checks: creates a synthetic
 * test conversation, runs the exact same `runResearchAgent` machinery the
 * public action uses, and finalizes the message.
 *
 * With `simulateCrashAfterRound` set, the loop throws mid-flight WITHOUT
 * finalizing — leaving the message stuck in `isStreaming: true` so the
 * watchdog (`mutations/messages.finalizeStuck`) can be exercised.
 *
 * Run with:
 *   npx convex run actions/chat:researchLoopTest '{"question": "…"}'
 */
export const researchLoopTest = internalAction({
  args: {
    question: v.string(),
    simulateCrashAfterRound: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    conversationId: Id<"conversations">;
    messageId: Id<"messages">;
    usage: ResearchUsage;
    steps: ResearchStep[];
    sourceCount: number;
    sources: Array<{ title: string; author: string; doc_id: string; locator: string }>;
    contentPreview: string;
  }> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    // Explicit annotation breaks the TS circularity from same-file
    // internal.* references (per Convex guidelines).
    const { conversationId }: { userId: Id<"users">; conversationId: Id<"conversations"> } =
      await ctx.runMutation(
        internal.mutations.testSupport.ensureTestConversation,
        { title: `Research loop test: ${args.question.slice(0, 50)}` }
      );

    await ctx.runMutation(internal.mutations.messages.create, {
      conversationId,
      role: "user",
      content: args.question,
      isStreaming: false,
    });
    const assistantMsgId: Id<"messages"> = await ctx.runMutation(
      internal.mutations.messages.create,
      {
        conversationId,
        role: "assistant",
        content: "",
        model: "claude",
        modelVariant: RESEARCH_MODEL,
        isStreaming: true,
      }
    );

    // Intentionally NOT wrapped in try/catch when simulating a crash —
    // the message must stay isStreaming:true for the watchdog test.
    const result = await runResearchAgent({
      ctx,
      assistantMsgId,
      apiKey,
      question: args.question,
      history: [],
      simulateCrashAfterRound: args.simulateCrashAfterRound,
    });

    await ctx.runMutation(internal.mutations.messages.finalize, {
      messageId: assistantMsgId,
      content: result.content,
      sources: result.sources,
    });

    return {
      conversationId,
      messageId: assistantMsgId,
      usage: result.usage,
      steps: result.steps,
      sourceCount: result.sources.length,
      sources: result.sources.map((s) => ({
        title: s.title,
        author: s.author_speaker,
        doc_id: s.doc_id,
        locator: s.chapter_section,
      })),
      contentPreview: result.content.slice(0, 1500),
    };
  },
});

// ── Shared helpers ─────────────────────────────────────────────────────

/**
 * Load prior conversation history. We pull the full message doc (not just
 * role+content) so we can re-attach each prior assistant turn's sources —
 * without this, the LLM is blind to source [N] references the user might
 * make about prior answers, and switching models mid-conversation loses
 * citation continuity.
 *
 * Token-budget tradeoff: the LAST 2 assistant turns get FULL chunk text
 * inlined (so the model can quote/discuss them); older turns get a
 * title-only legend (so the model knows what [N] referred to without
 * paying the full text cost).
 */
async function loadConversationHistory(
  ctx: ActionCtx,
  conversationId: Id<"conversations">
): Promise<Array<{ role: string; content: string }>> {
  const historyDocs = (await ctx.runQuery(api.queries.messages.byConversation, {
    conversationId,
  })) as Array<{
    role: string;
    content: string;
    isStreaming?: boolean;
    sources?: Array<{
      title?: string;
      author_speaker?: string;
      text?: string;
      chapter_section?: string;
    }>;
  }>;
  // Exclude the in-flight assistant placeholder (this very reply).
  const docs = historyDocs.filter((m) => !m.isStreaming);
  // Find which assistant turns are "recent enough" to deserve full
  // text. We walk backwards and mark the last 2 we see.
  const recentAssistantIdx = new Set<number>();
  {
    let seen = 0;
    for (let i = docs.length - 1; i >= 0 && seen < 2; i--) {
      if (docs[i].role === "assistant" && docs[i].sources?.length) {
        recentAssistantIdx.add(i);
        seen++;
      }
    }
  }
  return docs.map((m, idx) => {
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
}

/**
 * Build the reply-language directive for a user message. The chat LLM
 * otherwise drifts toward Turkish on every reply because the corpus and
 * most history are Turkish. We override that drift with an explicit
 * instruction wrapped around the user query.
 */
function buildLanguageDirective(content: string): string {
  const detectedLang = detectReplyLanguage(content);
  return (
    `[SYSTEM: The user just wrote in ${detectedLang.label}. ` +
    `You MUST write your ENTIRE reply in ${detectedLang.label}. ` +
    `Do NOT switch to Turkish, Arabic, or any other language even ` +
    `though the source passages are mostly Turkish. Translate any ` +
    `quoted source material into ${detectedLang.label}, but keep ` +
    `the original Turkish/Arabic phrase in parentheses or as a ` +
    `parenthetical when a key term is untranslatable.]\n\n`
  );
}

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
 * Detect the reply language for a user message. Returns a code + a human
 * label suitable for splicing into a prompt.
 *
 * The detection is intentionally simple: Arabic-script glyphs → Arabic,
 * Turkish diacritics OR a Turkish stopword → Turkish, otherwise English.
 * Anything weirder (French, Indonesian) falls through to English; that's
 * fine for now since the actual user base is TR/EN/AR.
 */
function detectReplyLanguage(text: string): { code: "tr" | "en" | "ar"; label: string } {
  const t = text || "";
  if (/[؀-ۿ]/.test(t)) return { code: "ar", label: "Arabic" };
  if (
    /[ıİğĞşŞçÇöÖüÜ]/.test(t) ||
    /\b(ve|bir|için|nedir|nasıl|hangi|olan|neden|olarak|hakkında)\b/i.test(t)
  ) {
    return { code: "tr", label: "Turkish" };
  }
  return { code: "en", label: "English" };
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
