/**
 * Source-context reads for the viewer panels.
 *
 * The search/chat UIs show a retrieved chunk in a right-hand panel; this
 * action lets that panel expand into the SURROUNDING work text so the user
 * can read the passage in context (scroll up into earlier passages, down
 * into later ones) without leaving the page.
 *
 * It proxies the corpus tool server on the Hetzner box, keeping
 * `RAG_API_KEY` server-side:
 *
 *  Initial load (no `charOffset`):
 *   1. `/tools/locate_passage` — exact global char position of the chunk
 *      inside the work (fast normalized scan over ONE work; the BM25
 *      `search_text` route costs 7-9s per call and is NOT used here).
 *   2. `/tools/read_document` — one char window starting a little before
 *      the match so the chunk lands mid-panel with context above it.
 *
 *  Pagination (`charOffset` set): one `read_document` call. The tool
 *  server's separator invariant makes sequential windows concatenate
 *  losslessly, so the client can stitch "load earlier / load later"
 *  windows onto what it already has.
 *
 * Runs in the default V8 runtime (fetch only, no Node built-ins) — the
 * Node runtime's cold start was a visible part of panel latency.
 */
import { action } from "./_generated/server";
import { v } from "convex/values";

/** Per-call ceiling the tool server enforces on char_limit. */
const MAX_WINDOW_CHARS = 18_000;
const DEFAULT_WINDOW_CHARS = 14_000;
/** Context above the matched chunk on first load. */
const PRE_CONTEXT_CHARS = 4_500;

interface ReadWindow {
  doc_id: string;
  title: string;
  author_speaker: string;
  source_type: string;
  ordering_confident: boolean;
  char_offset: number;
  chars_returned: number;
  total_chars_in_range: number;
  next_char_offset: number | null;
  text: string;
  passages: Array<{
    ordering: number;
    page_number: number | null;
    char_start: number;
  }>;
}

interface LocateResult {
  found: boolean;
  ordering: number | null;
  page_number: number | null;
  passage_char_start: number | null;
  match_char_offset: number | null;
  total_chars: number;
  ordering_confident: boolean;
}

async function toolFetch<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const baseUrl = process.env.RAG_API_URL ?? "http://localhost:8000";
  const apiKey = process.env.RAG_API_KEY ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const r = await fetch(`${baseUrl}/tools/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 300);
      throw new Error(`tool ${path} returned ${r.status}: ${detail}`);
    }
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const windowPayload = (w: ReadWindow) => ({
  ok: true as const,
  docId: w.doc_id,
  title: w.title,
  author: w.author_speaker,
  sourceType: w.source_type,
  orderingConfident: w.ordering_confident,
  charOffset: w.char_offset,
  totalChars: w.total_chars_in_range,
  nextCharOffset: w.next_char_offset,
  text: w.text,
  passages: w.passages.map((p) => ({
    ordering: p.ordering,
    pageNumber: p.page_number,
    charStart: p.char_start,
  })),
});

export const getContext = action({
  args: {
    docId: v.string(),
    /** Chunk text — locates the exact position inside the work. */
    chunkText: v.optional(v.string()),
    /** Known anchor passage ordering (research citations carry one) —
     *  fallback when the chunk text can't be matched verbatim. */
    passageStart: v.optional(v.number()),
    /** Set for "load earlier / load later" pagination: serve exactly this
     *  char window of the work, no anchor resolution. */
    charOffset: v.optional(v.number()),
    charLimit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const charLimit = Math.min(
      MAX_WINDOW_CHARS,
      Math.max(1_000, args.charLimit ?? DEFAULT_WINDOW_CHARS),
    );

    const readAt = (offset: number, limit: number) =>
      toolFetch<ReadWindow>("read_document", {
        doc_id: args.docId,
        char_offset: Math.max(0, Math.floor(offset)),
        char_limit: Math.min(MAX_WINDOW_CHARS, Math.max(200, Math.floor(limit))),
      });

    try {
      // ── Pagination path ──────────────────────────────────────────
      if (args.charOffset != null) {
        return windowPayload(await readAt(args.charOffset, charLimit));
      }

      // ── Initial load: locate the chunk, serve a centered window ──
      let anchorOffset: number | null = null;
      let anchorOrdering: number | null = null;

      if (args.chunkText && args.chunkText.trim().length >= 10) {
        const loc = await toolFetch<LocateResult>("locate_passage", {
          doc_id: args.docId,
          text: args.chunkText.slice(0, 600),
        });
        if (loc.found && loc.match_char_offset != null) {
          anchorOffset = loc.match_char_offset;
          anchorOrdering = loc.ordering;
        }
      }

      // Fallback for research citations whose excerpt didn't match
      // verbatim: position by the passage ordering they carry. A tiny
      // read over the preceding passages returns their total length —
      // exactly the anchor passage's global char position.
      if (anchorOffset == null && args.passageStart != null) {
        anchorOrdering = args.passageStart;
        if (args.passageStart === 0) {
          anchorOffset = 0;
        } else {
          const probe = await toolFetch<ReadWindow>("read_document", {
            doc_id: args.docId,
            start_passage: 0,
            end_passage: args.passageStart - 1,
            char_limit: 200,
          });
          anchorOffset = probe.total_chars_in_range + 2; // + separator
        }
      }

      if (anchorOffset == null) {
        return { ok: false as const, error: "not_located" as const };
      }

      const window = await readAt(
        Math.max(0, anchorOffset - PRE_CONTEXT_CHARS),
        charLimit,
      );
      return { ...windowPayload(window), anchorOrdering };
    } catch (e) {
      console.warn("sourceContext.getContext failed:", e);
      return { ok: false as const, error: "unavailable" as const };
    }
  },
});
