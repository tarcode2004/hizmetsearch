"use node";
/**
 * Source-context reads for the viewer panels.
 *
 * The search/chat UIs show a retrieved chunk in a right-hand panel; this
 * action lets that panel expand into the SURROUNDING work text so the user
 * can read the passage in context (scroll up into earlier passages, down
 * into later ones) without leaving the page.
 *
 * It proxies the corpus tool server on the Hetzner box (same endpoints the
 * deep-research agent uses — `search_text`, `get_work_outline`,
 * `read_document`), keeping `RAG_API_KEY` server-side:
 *
 *  Initial load (no `charOffset`):
 *   1. Resolve the chunk's anchor passage: use the caller-supplied
 *      `passageStart` (research citations carry one) or locate it by
 *      phrase-searching a distinctive slice of the chunk text scoped to
 *      the work (`filters.work_id`).
 *   2. Compute the anchor passage's char position in the work's virtual
 *      concatenation (passage lengths from `get_work_outline`; passages
 *      are joined with a 2-char separator — see api/app/textwindow.py).
 *   3. Read a char window that starts a little before the anchor so the
 *      chunk lands mid-panel with context above it. If the chunk text
 *      isn't inside that window (huge transcript passages), scan forward
 *      window-by-window within the anchor passage.
 *
 *  Pagination (`charOffset` set): one `read_document` call. The tool
 *  server's separator invariant makes sequential windows concatenate
 *  losslessly, so the client can stitch "load earlier / load later"
 *  windows onto what it already has.
 */
import { action } from "../_generated/server";
import { v } from "convex/values";

/** Per-call ceiling the tool server enforces on char_limit. */
const MAX_WINDOW_CHARS = 18_000;
const DEFAULT_WINDOW_CHARS = 14_000;
/** Context above the anchor passage on first load. */
const PRE_CONTEXT_CHARS = 4_500;
/** Forward scan cap when the chunk sits deep inside a huge passage. */
const MAX_ANCHOR_SCAN_WINDOWS = 8;
/** Outline pages (500 passages each) we're willing to walk to find the
 *  anchor's char position. 4 pages = works up to 2000 passages. */
const MAX_OUTLINE_PAGES = 4;
const SEPARATOR_LEN = 2; // "\n\n" between passages in the virtual concat

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

/** Same conservative normalization as lib/evidence.ts — tolerate Turkish
 *  typography and line-wrapping differences without hiding altered words. */
function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

/** A distinctive probe from the middle of the chunk — the head/tail may be
 *  clipped mid-word by the chunker, so words 1..9 of the normalized text
 *  make a safer phrase query. */
function probeWords(chunkText: string, maxWords: number): string {
  const words = normalizeText(chunkText)
    .split(" ")
    .filter((w) => w.length >= 2);
  if (words.length <= 2) return words.join(" ");
  return words.slice(1, 1 + maxWords).join(" ");
}

/** Locate the passage (by `ordering`) inside `docId` that contains the
 *  chunk text. Phrase match first (exact adjacency), then loose match. */
async function locateAnchorPassage(
  docId: string,
  chunkText: string,
): Promise<number | null> {
  interface SearchTextResponse {
    hits: Array<{ ordering: number; work_id: string }>;
  }
  const phrase = probeWords(chunkText, 8);
  if (!phrase) return null;
  for (const mode of ["phrase", "match"] as const) {
    try {
      const resp = await toolFetch<SearchTextResponse>("search_text", {
        query: phrase,
        mode,
        limit: 1,
        filters: { work_id: docId },
      });
      const hit = resp.hits?.[0];
      if (hit && typeof hit.ordering === "number") return hit.ordering;
    } catch (e) {
      console.warn(`locateAnchorPassage ${mode} failed:`, e);
    }
  }
  return null;
}

/** Char position of the anchor passage's start in the work's virtual
 *  concatenation, plus its own length. Null when the anchor is beyond the
 *  outline pages we're willing to walk. */
async function anchorCharStart(
  docId: string,
  anchorOrdering: number,
): Promise<{ charStart: number; anchorChars: number } | null> {
  interface OutlineResponse {
    passage_map: Array<{ ordering: number; chars: number }>;
    passage_map_truncated: boolean;
  }
  let charStart = 0;
  let precedingCount = 0;
  for (let page = 0; page < MAX_OUTLINE_PAGES; page++) {
    const resp = await toolFetch<OutlineResponse>("get_work_outline", {
      doc_id: docId,
      max_entries: 500,
      offset: page * 500,
    });
    for (const entry of resp.passage_map) {
      if (entry.ordering === anchorOrdering) {
        return {
          charStart: charStart + precedingCount * SEPARATOR_LEN,
          anchorChars: entry.chars,
        };
      }
      charStart += entry.chars;
      precedingCount++;
    }
    if (!resp.passage_map_truncated) break;
  }
  return null;
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
    /** Chunk text — used to locate the anchor passage and to verify the
     *  served window actually contains the chunk. */
    chunkText: v.optional(v.string()),
    /** Known anchor passage ordering (research citations carry one) —
     *  skips the search_text location step. */
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

      // ── Initial load: resolve anchor, serve a centered window ───
      const anchorOrdering =
        args.passageStart ??
        (args.chunkText
          ? await locateAnchorPassage(args.docId, args.chunkText)
          : null);
      if (anchorOrdering == null) {
        return { ok: false as const, error: "not_located" as const };
      }

      const position = await anchorCharStart(args.docId, anchorOrdering);
      const startAt = position
        ? Math.max(0, position.charStart - PRE_CONTEXT_CHARS)
        : 0;
      let window = await readAt(startAt, charLimit);

      // Verify the chunk is inside the window. When the anchor passage is
      // bigger than one window (long transcripts), scan forward inside it.
      if (args.chunkText && position) {
        const probe = normalizeText(args.chunkText).slice(0, 120);
        const anchorEnd = position.charStart + position.anchorChars;
        let scans = 0;
        while (
          probe.length >= 30 &&
          !normalizeText(window.text).includes(probe) &&
          window.next_char_offset != null &&
          window.next_char_offset < anchorEnd &&
          scans < MAX_ANCHOR_SCAN_WINDOWS
        ) {
          window = await readAt(window.next_char_offset, charLimit);
          scans++;
        }
      }

      return {
        ...windowPayload(window),
        anchorOrdering,
      };
    } catch (e) {
      console.warn("sourceContext.getContext failed:", e);
      return { ok: false as const, error: "unavailable" as const };
    }
  },
});
