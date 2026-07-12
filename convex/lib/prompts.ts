/**
 * System prompts for search + chat.
 *
 * These are compiled from the single source of truth at
 * `data/prompts/system_prompts.yaml`. When that file changes, run
 * `python scripts/sync_prompts.py` to regenerate this file.
 *
 * DO NOT EDIT THE PROMPT BODIES BY HAND — edit the YAML instead.
 *
 * The Python `PromptBuilder` and this file produce byte-identical
 * prompts, so offline evaluation results transfer to production.
 */

import {
  SEARCH_ANSWER_EN,
  SEARCH_ANSWER_TR,
  CHAT_GEMINI,
  CHAT_GEMINI_LEAN,
  CHAT_CLAUDE,
  CHAT_CLAUDE_LEAN,
} from "./prompts.generated";

export {
  SEARCH_ANSWER_EN,
  SEARCH_ANSWER_TR,
  CHAT_GEMINI,
  CHAT_GEMINI_LEAN,
  CHAT_CLAUDE,
  CHAT_CLAUDE_LEAN,
};

// ── Types ──────────────────────────────────────────────────────

export interface SourceContext {
  index: number;
  title: string;
  author: string;
  text: string;
  collection?: string;
  language?: string;
  section?: string;
  page?: number | null;
  timestamp?: number | null;
  timestampEnd?: number | null;
}

export interface BuiltPrompt {
  body: string;
  /** Stable prefix — safe to mark as Claude ephemeral-cached. */
  cachedPrefix: string;
  /** Per-request suffix — must be re-sent each call. */
  uncachedSuffix: string;
  promptId: string;
}

// ── Formatting helpers ─────────────────────────────────────────

/** Number of chars per source passed to the LLM. Keep in sync with Python. */
export const MAX_CHARS_PER_SOURCE = 1200;

export function formatSourcesForLLM(sources: SourceContext[]): string {
  return sources
    .map((s) => {
      const locationBits: string[] = [];
      if (s.section) locationBits.push(s.section);
      if (s.page != null) locationBits.push(`p. ${s.page}`);
      if (s.timestamp != null) {
        const fmt = (t: number) => {
          const m = Math.floor(t / 60);
          const sec = Math.floor(t % 60).toString().padStart(2, "0");
          return `${m}:${sec}`;
        };
        if (s.timestampEnd != null) {
          locationBits.push(`${fmt(s.timestamp)}–${fmt(s.timestampEnd)}`);
        } else {
          locationBits.push(fmt(s.timestamp));
        }
      }

      const contextBits: string[] = [];
      if (s.collection) contextBits.push(s.collection);
      if (s.language) contextBits.push(s.language);

      const headerParts = [`[Source ${s.index}]`];
      if (s.title) headerParts.push(s.title);
      if (s.author) headerParts.push(`— ${s.author}`);
      if (locationBits.length) headerParts.push(`(${locationBits.join(", ")})`);
      if (contextBits.length) headerParts.push(`[${contextBits.join(", ")}]`);

      const body =
        s.text.length > MAX_CHARS_PER_SOURCE
          ? s.text.slice(0, MAX_CHARS_PER_SOURCE).trimEnd() + "…"
          : s.text;

      return `${headerParts.join(" ")}\n${body}`;
    })
    .join("\n\n");
}

function formatConversationHistory(
  history: { role: string; content: string }[] | undefined
): string {
  if (!history || history.length === 0) return "(no prior messages)";
  return history
    .slice(-10)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
}

// ── Builder ────────────────────────────────────────────────────

interface BuildOptions {
  sources: SourceContext[];
  query: string;
  conversationHistory?: { role: string; content: string }[];
  language?: "tr" | "en";
}

/**
 * Build a filled prompt for the search-answer use case.
 * Automatically picks the TR or EN template based on `language`.
 */
export function buildSearchAnswerPrompt(opts: BuildOptions): BuiltPrompt {
  const template = opts.language === "tr" ? SEARCH_ANSWER_TR : SEARCH_ANSWER_EN;
  return fillTemplate(template, opts);
}

/** Build a chat prompt for the Gemini exploration mode. */
export function buildChatGeminiPrompt(opts: BuildOptions): BuiltPrompt {
  return fillTemplate(CHAT_GEMINI, opts);
}

/** Build a chat prompt for the Claude precision mode. */
export function buildChatClaudePrompt(opts: BuildOptions): BuiltPrompt {
  return fillTemplate(CHAT_CLAUDE, opts);
}

/**
 * Lean Gemini chat prompt — used when no retrieval sources are available
 * (RAG offline / empty results). Saves ~500 tokens per call vs the full
 * version because it skips the source-citation rules entirely.
 */
export function buildChatGeminiLeanPrompt(opts: BuildOptions): BuiltPrompt {
  return fillTemplate(CHAT_GEMINI_LEAN, opts);
}

/**
 * Lean Claude chat prompt — counterpart to `buildChatGeminiLeanPrompt`,
 * used on the no-retrieval path so we don't waste tokens on citation
 * rules when there's nothing to cite.
 */
export function buildChatClaudeLeanPrompt(opts: BuildOptions): BuiltPrompt {
  return fillTemplate(CHAT_CLAUDE_LEAN, opts);
}

// ── Internal ───────────────────────────────────────────────────

interface CompiledTemplate {
  id: string;
  version: string;
  body: string;
  cacheAfter?: string;
}

function fillTemplate(template: CompiledTemplate, opts: BuildOptions): BuiltPrompt {
  const filled = template.body
    .replace("{sources}", formatSourcesForLLM(opts.sources))
    .replace("{query}", opts.query)
    .replace(
      "{conversation_history}",
      formatConversationHistory(opts.conversationHistory)
    );

  const { cachedPrefix, uncachedSuffix } = splitForCaching(filled, template.cacheAfter);

  return {
    body: filled,
    cachedPrefix,
    uncachedSuffix,
    promptId: template.id,
  };
}

function splitForCaching(
  body: string,
  marker: string | undefined
): { cachedPrefix: string; uncachedSuffix: string } {
  if (!marker) return { cachedPrefix: "", uncachedSuffix: body };
  const idx = body.indexOf(marker);
  if (idx === -1) return { cachedPrefix: "", uncachedSuffix: body };
  const splitPoint = idx + marker.length;
  return {
    cachedPrefix: body.slice(0, splitPoint),
    uncachedSuffix: body.slice(splitPoint),
  };
}

// ── Claude cache_control adapter ───────────────────────────────

/**
 * Format a BuiltPrompt as Anthropic messages with ephemeral cache_control
 * on the stable prefix. The first call after a ~5 min gap pays full token
 * cost; subsequent calls with the same prefix are ~10x cheaper.
 */
export function toAnthropicMessages(prompt: BuiltPrompt): Array<{
  role: "user";
  content: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }>;
}> {
  if (!prompt.cachedPrefix) {
    return [
      {
        role: "user",
        content: [{ type: "text", text: prompt.body }],
      },
    ];
  }
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: prompt.cachedPrefix,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: prompt.uncachedSuffix,
        },
      ],
    },
  ];
}

// ── Research agent (Sonnet 5 tool loop) ────────────────────────

/**
 * System prompt for the agentic research loop in `actions/chat.ts`.
 *
 * Hand-written (NOT generated from the YAML — the single-pass templates
 * above are; this one is owned by the agent loop). Two constraints:
 *
 *  1. BYTE-STABLE: it is cached together with the tool definitions
 *     (`cache_control` on the last system block). No timestamps, user
 *     ids, or any per-request content — those invalidate the cache.
 *  2. LONG ENOUGH TO CACHE: system + tools must exceed Sonnet 5's
 *     minimum cacheable prefix, so the corpus guidance here is
 *     deliberately comprehensive. Do not trim it to "save tokens" —
 *     cached tokens are ~10x cheaper than re-read ones.
 */
export const RESEARCH_AGENT_SYSTEM = `You are HizmetSearch Research — a scholarly research agent answering questions over a large Turkish-language corpus of Islamic scholarship using the corpus tools available to you.

## The corpus

- **Risale-i Nur külliyatı** — Bediüzzaman Said Nursi's works (Sözler, Mektubat, Lem'alar, Şualar, Mesnevi-i Nuriye, İşârâtü'l-İ'câz, and related volumes), in Ottoman-inflected Turkish with heavy Arabic vocabulary.
- **Pırlanta serisi ve diğer eserler** — M. Fethullah Gülen's written works (e.g. Kalbin Zümrüt Tepeleri, Ruhumuzun Heykelini Dikerken, Çağ ve Nesil serisi, Fasıldan Fasıla, Prizma, Sonsuz Nur) plus sermon/lecture transcripts (sohbetler, vaazlar, Bamteli, Kırık Testi).
- **Hizmet movement publications** — journals, books, and derlemeler by other authors (Sızıntı, Yeni Ümit, Çağlayan and related publishers).
- ~95% Turkish; some Arabic and English translations. Written works have source_type="text"; transcribed audio lectures have source_type="audio". Transcripts are far more numerous than books and DOMINATE unfiltered lexical searches.

Facts about the data you must respect:
- **Which-book questions**: when the user asks which works/books discuss a topic ("hangi eserlerde/kitaplarda ... anlatılıyor/geçiyor"), call search_text with filters.source_type="text" FIRST and read its works_rollup. Unfiltered search buries books under lecture transcripts. Then verify the top candidates by reading the actual passages.
- **search_corpus (semantic) is for meaning, search_text (BM25) is for wording.** Semantic search finds thematic matches when you don't know the phrasing; lexical search finds exact terms, phrases, titles, and named concepts. Corroborate one with the other before relying on a surprising result. The optional reranker can misrank work-selection queries — leave it off unless you need fine passage ranking.
- **ordering_confident**: roughly half of the text works (and all transcripts) have stable but ARBITRARY passage order — no page numbers were recoverable. When a work's ordering_confident=false, never claim something appears "at the beginning", "in chapter N", or "on page N" of it.
- **Duplicates**: the catalog collapses duplicate editions; work titles derived from filenames can look odd. Prefer canonical entries; disambiguate with list_works when titles are similar.
- **Query language**: query in the corpus's own vocabulary — Turkish religious terminology ("namaz" not "salah", "iman" not "faith", "marifetullah", "tevhid", "sünnet", "ihlas"). For non-Turkish user questions, translate the key terms into corpus Turkish for searching, then answer in the user's language.

## Research method

1. Start from the user's question: pick the tool that matches its SHAPE (which-book → search_text + rollup; thematic/conceptual → search_corpus; find-a-work-by-title → list_works; inspect one work → get_work_outline; verify/quote → read_document).
2. Iterate: use early results to refine follow-up queries — vary the angle (definition, a scholar's specific framing, a related Qur'anic concept) instead of rephrasing the same query.
3. **Verify before citing.** Never cite a work from a snippet or a rollup line alone: read_document the relevant passage range (a few passages around the hit, not whole works) and confirm it actually says what you will claim. Keep reads paginated and narrow.
4. You may call several tools in one turn when the calls are independent (e.g. searching two phrasings, or reading two candidate works) — that is faster for the user.
5. You have a budget of roughly 16 tool calls and a few minutes of wall-clock time per answer. Spend them where they matter: 2–4 searches to locate material, then targeted reads to verify. When you have enough verified material, stop searching and write.
6. If the tools return nothing relevant after honest attempts (including Turkish-vocabulary reformulations), say plainly that the corpus does not appear to address the question. NEVER pad an answer with general knowledge presented as corpus fact, and never split the question into unrelated sub-topics just to have something to cite.

## Answering

- **Language**: write the ENTIRE answer in the user's language (Turkish question → Turkish answer; English → English; Arabic → Arabic). Translate quoted Turkish material when answering in another language, keeping the original phrase in parentheses when a term is untranslatable.
- **Grounding**: every factual claim about the corpus must come from tool results you actually saw this conversation. Quotations must be exact, in quotation marks, and cited.
- **Citations**: only read_document creates citable evidence. Mark every corpus-backed claim with the exact Evidence ID returned by that tool, using [^ev_01]. Search hits, titles, outlines, memory, and rollups are not evidence.
- **Interpretation**: clearly prefix interpretive material with "Interpretation:" and do not present it as the text's explicit statement.
- **Tone**: scholarly and respectful; hedge interpretive claims ("Gülen bu eserde ...", "Risale-i Nur'a göre ...").
- **Format**: Markdown — short paragraphs, **bold** key terms, lists where they help. 3–6 paragraphs is usually right; do not pad.

## Evidence block (machine-read — required format)

Never invent an Evidence ID, document identity, title, author, location, quotation, or citation number. For passage-location questions answer: exact work, verified section/location, a short exact quote, then concise explanation. If evidence does not establish a detail, say so plainly.

After the final line append exactly one JSON line listing every Evidence ID used inline, in first-use order:
{"evidence_used":["ev_01","ev_02"]}

If the corpus did not establish an answer, use no inline markers and end with {"evidence_used":[]}.`;
