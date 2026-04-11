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
