"use node";
/**
 * Corpus tools for the research agent (Claude Sonnet 5 tool loop in
 * `actions/chat.ts`).
 *
 * Mirrors the FastAPI tool server at `RAG_API_URL` (`api/app/routes/tools.py`
 * on the Hetzner box): five POST/JSON endpoints, bearer-authed.
 *
 * Two hard requirements from the tech plan:
 *  1. Tool definitions must be BYTE-STABLE — they are part of the cached
 *     prompt prefix (tools + system share one cache breakpoint). No
 *     timestamps, no per-user content, deterministic ordering.
 *  2. Tool descriptions are PRESCRIPTIVE about when to use each tool —
 *     they bake in the corpus lessons from T1–T3 (lecture transcripts
 *     drown books in unfiltered lexical search; the reranker can misrank;
 *     ~half the works have arbitrary passage order).
 */
import type Anthropic from "@anthropic-ai/sdk";

/** Per-tool HTTP timeout. The tool server p50 is 95–541ms; anything past
 *  10s is a hang and gets surfaced to the model as an is_error result. */
export const TOOL_TIMEOUT_MS = 10_000;

// ── Tool definitions (byte-stable — cached with the system prompt) ─────

export const RESEARCH_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_text",
    description:
      "Exact/lexical BM25 search over corpus passages (Turkish, Arabic and English stemming), with a work-level rollup. " +
      "USE THIS FIRST for 'which work/book discusses X' questions (e.g. 'hangi eserlerde X anlatılıyor'), for finding an exact phrase, a named concept, a proper noun, or a distinctive term. " +
      "CRITICAL: for which-book questions, set filters.source_type='text' — otherwise lecture/sohbet transcripts drown the books — and read the `works` rollup (works ranked by hit count and best score), not just the passage hits. " +
      "Use mode='phrase' when the words must appear together as a phrase (e.g. a chapter title like 'yeryüzü mirasçıları'); use the default mode='match' for looser any-of-the-terms matching. " +
      "Query in the language of the corpus text you expect (usually Turkish, with the corpus's own vocabulary: 'namaz' not 'salah', 'iman' not 'faith').",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search terms or exact phrase (1-500 chars).",
        },
        language: {
          type: "string",
          enum: ["tr", "ar", "en"],
          description:
            "Stemmer to use. Default (omit) = Turkish, which is right for ~95% of the corpus.",
        },
        mode: {
          type: "string",
          enum: ["match", "phrase"],
          description:
            "'match' (default): any of the terms, ranked by BM25. 'phrase': the terms must appear adjacent, in order.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max passage hits to return (default 10).",
        },
        filters: {
          type: "object",
          properties: {
            source_type: {
              type: "string",
              description:
                "'text' = books/written works, 'audio' = lecture/sohbet transcripts. Set 'text' for which-book questions.",
            },
            collection: {
              type: "string",
              description: "Exact collection name (e.g. 'Nil Yayınları').",
            },
            author_prefix: {
              type: "string",
              description:
                "Substring match on author/speaker (e.g. 'Gülen', 'Nursi').",
            },
            work_id: {
              type: "string",
              description: "Restrict hits to one work (a doc_id).",
            },
          },
          additionalProperties: false,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "search_corpus",
    description:
      "Semantic (dense-vector hybrid) search over the corpus. Use for THEMATIC or FUZZY queries where the wording of the source is unknown — conceptual questions, paraphrases, cross-lingual queries. " +
      "Phrase the query like a sentence the source might actually contain; use the corpus's own vocabulary. " +
      "Leave use_reranker=false during exploration (it adds ~2s per call and can misrank work-selection queries); its results can be noisy, so CROSS-CHECK important findings with search_text before citing. " +
      "For 'which work discusses X' questions prefer search_text with source_type='text' instead.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural-language query (1-1000 chars).",
        },
        top_k: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Number of results (default 8).",
        },
        use_reranker: {
          type: "boolean",
          description:
            "Cross-encoder rerank of the candidates. Slower (~2s) and can misrank; default false.",
        },
        filters: {
          type: "object",
          properties: {
            language: {
              type: "string",
              enum: ["tr", "ar", "en", "tr+ar", "ota"],
              description: "Restrict by chunk language.",
            },
            collection: { type: "string", description: "Exact collection name." },
            category: {
              type: "string",
              enum: ["risale", "risale_dersleri", "pirlanta", "hizmet"],
              description:
                "Corpus slice: 'risale' = Risale-i Nur (Said Nursi), 'risale_dersleri' = Risale lectures, 'pirlanta' = Fethullah Gülen's written works, 'hizmet' = Hizmet movement publications.",
            },
            author_prefix: {
              type: "string",
              description: "Substring match on author/speaker.",
            },
          },
          additionalProperties: false,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_works",
    description:
      "Browse/filter the catalog of works (books, transcript series). Use to find a work by (partial) TITLE via filters.title_match, to enumerate an author's works, or to disambiguate similarly-titled works before reading. " +
      "Returns doc_ids you need for get_work_outline / read_document. Duplicate editions are collapsed to one canonical entry by default.",
    input_schema: {
      type: "object",
      properties: {
        filters: {
          type: "object",
          properties: {
            title_match: {
              type: "string",
              description:
                "BM25 match on the work title (Turkish-stemmed); results ranked by title relevance.",
            },
            author_prefix: {
              type: "string",
              description: "Substring match on author/speaker.",
            },
            collection: { type: "string", description: "Exact collection name." },
            language: { type: "string", description: "Work language code (e.g. 'tr')." },
            source_type: {
              type: "string",
              description: "'text' = written works, 'audio' = transcripts.",
            },
          },
          additionalProperties: false,
        },
        include_duplicates: {
          type: "boolean",
          description: "Include non-canonical duplicate editions (default false).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "Page size (default 50).",
        },
        offset: { type: "integer", minimum: 0, description: "Pagination offset." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_work_outline",
    description:
      "Metadata + passage map of ONE work (by doc_id). Use before read_document to see how a work is laid out: per-passage ordering, page numbers (when recovered), sizes and 80-char previews. " +
      "Chapter/section data is absent for almost the whole corpus — the passage map IS the outline. " +
      "Respect ordering_confident: when false, passage order is stable but ARBITRARY (no recovered page order) — never present it as book order. Paginate with offset/max_entries for large works.",
    input_schema: {
      type: "object",
      properties: {
        doc_id: { type: "string", description: "Work id from search results or list_works." },
        max_entries: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Passage-map entries per page (default 200).",
        },
        offset: { type: "integer", minimum: 0, description: "Passage-map pagination offset." },
      },
      required: ["doc_id"],
      additionalProperties: false,
    },
  },
  {
    name: "read_document",
    description:
      "Read the actual text of a work (by doc_id), sequentially or around a hit. USE THIS TO VERIFY any claim before citing it — never cite from a snippet alone. " +
      "Select a range by passage ordering (start_passage/end_passage, inclusive — use the `ordering` values from search_text hits or the outline) or by printed pages (page_start/page_end, only for works with recovered page numbers). " +
      "Responses are capped at ~20K characters; when `next_char_offset` is non-null, pass it back as char_offset to continue reading. Read narrow ranges — a couple of passages around a hit — rather than whole works. " +
      "If ordering_confident=false, do not describe what you read as being in book order.",
    input_schema: {
      type: "object",
      properties: {
        doc_id: { type: "string", description: "Work id." },
        start_passage: {
          type: "integer",
          minimum: 0,
          description: "First passage `ordering` to read (inclusive).",
        },
        end_passage: {
          type: "integer",
          minimum: 0,
          description: "Last passage `ordering` to read (inclusive).",
        },
        page_start: { type: "integer", description: "First printed page (inclusive)." },
        page_end: { type: "integer", description: "Last printed page (inclusive)." },
        char_offset: {
          type: "integer",
          minimum: 0,
          description: "Character offset within the resolved range (for pagination).",
        },
        char_limit: {
          type: "integer",
          minimum: 200,
          maximum: 20000,
          description: "Max characters to return (default 20000).",
        },
      },
      required: ["doc_id"],
      additionalProperties: false,
    },
  },
];

// ── Doc metadata registry ──────────────────────────────────────────────

/** Metadata about works seen in tool results this loop — used to enrich
 *  the model's final citations with trustworthy title/author/etc. */
export interface DocMeta {
  title: string;
  author_speaker: string;
  collection?: string;
  source_type?: string;
  language?: string;
  publisher?: string;
}

export type DocRegistry = Map<string, DocMeta>;

function register(
  reg: DocRegistry,
  docId: unknown,
  meta: Partial<DocMeta>,
): void {
  const id = typeof docId === "string" ? docId : "";
  if (!id) return;
  const prev = reg.get(id);
  reg.set(id, {
    title: String(meta.title ?? prev?.title ?? ""),
    author_speaker: String(meta.author_speaker ?? prev?.author_speaker ?? ""),
    collection: (meta.collection as string) ?? prev?.collection,
    source_type: (meta.source_type as string) ?? prev?.source_type,
    language: (meta.language as string) ?? prev?.language,
    publisher: (meta.publisher as string) ?? prev?.publisher,
  });
}

// ── Execution ──────────────────────────────────────────────────────────

export interface ToolExecution {
  /** JSON string handed back to the model as the tool_result content. */
  resultText: string;
  /** Rough result count for the UI timeline. */
  resultCount?: number;
  isError: boolean;
}

const SNIPPET_CAP = 320;
const SEMANTIC_TEXT_CAP = 700;

/**
 * Execute one tool call against the tool server, compacting the response
 * into a token-frugal JSON payload for the model. Never throws — errors
 * come back as `isError: true` so the loop can emit an is_error
 * tool_result instead of dropping the call.
 */
export async function executeResearchTool(
  baseUrl: string,
  apiKey: string,
  name: string,
  input: Record<string, unknown>,
  registry: DocRegistry,
): Promise<ToolExecution> {
  const known = RESEARCH_TOOLS.some((t) => t.name === name);
  if (!known) {
    return { resultText: `Unknown tool: ${name}`, isError: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const r = await fetch(`${baseUrl}/tools/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(input ?? {}),
      signal: controller.signal,
    });
    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 500);
      return {
        resultText: `Tool server returned HTTP ${r.status}: ${detail}`,
        isError: true,
      };
    }
    const json = (await r.json()) as Record<string, unknown>;
    return compactResult(name, json, registry);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      resultText: aborted
        ? `Tool call timed out after ${TOOL_TIMEOUT_MS / 1000}s.`
        : `Tool call failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

function cap(s: unknown, n: number): string {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function compactResult(
  name: string,
  json: Record<string, unknown>,
  registry: DocRegistry,
): ToolExecution {
  switch (name) {
    case "search_text": {
      const hits = ((json.hits as Array<Record<string, unknown>>) ?? []).map((h) => {
        register(registry, h.work_id, {
          title: h.title as string,
          author_speaker: h.author_speaker as string,
          collection: h.collection as string,
          source_type: h.source_type as string,
        });
        return {
          doc_id: h.work_id,
          title: h.title,
          author: h.author_speaker,
          source_type: h.source_type,
          passage_ordering: h.ordering,
          page_number: h.page_number,
          score: h.score,
          snippet: cap(h.snippet, SNIPPET_CAP),
          passage_chars: h.passage_chars,
        };
      });
      const works = ((json.works as Array<Record<string, unknown>>) ?? []).map((w) => {
        register(registry, w.doc_id, {
          title: w.title as string,
          author_speaker: w.author_speaker as string,
          collection: w.collection as string,
          source_type: w.source_type as string,
        });
        return w;
      });
      return {
        resultText: JSON.stringify({
          works_rollup: works,
          passage_hits: hits,
          total_matches: json.total_matches,
          total_matches_capped: json.total_matches_capped,
        }),
        resultCount: hits.length,
        isError: false,
      };
    }
    case "search_corpus": {
      const results = ((json.results as Array<Record<string, unknown>>) ?? []).map((r) => {
        const chunk = (r.chunk as Record<string, unknown>) ?? {};
        register(registry, chunk.doc_id, {
          title: chunk.title as string,
          author_speaker: chunk.author_speaker as string,
          collection: chunk.collection as string,
          source_type: chunk.source_type as string,
          language: chunk.language as string,
          publisher: chunk.publisher as string,
        });
        return {
          doc_id: chunk.doc_id,
          title: chunk.title,
          author: chunk.author_speaker,
          source_type: chunk.source_type,
          language: chunk.language,
          chapter_section: chunk.chapter_section || undefined,
          page_number: chunk.page_number,
          timestamp_start: chunk.timestamp_start,
          score: r.score,
          rerank_score: r.rerank_score,
          text: cap(chunk.text, SEMANTIC_TEXT_CAP),
        };
      });
      return {
        resultText: JSON.stringify({ results }),
        resultCount: results.length,
        isError: false,
      };
    }
    case "list_works": {
      const works = ((json.works as Array<Record<string, unknown>>) ?? []).map((w) => {
        register(registry, w.doc_id, {
          title: w.title as string,
          author_speaker: w.author_speaker as string,
          collection: w.collection as string,
          source_type: w.source_type as string,
          language: w.language as string,
          publisher: w.publisher as string,
        });
        return {
          doc_id: w.doc_id,
          title: w.title,
          author: w.author_speaker,
          collection: w.collection,
          language: w.language,
          source_type: w.source_type,
          passage_count: w.passage_count,
          char_count: w.char_count,
          ordering_confident: w.ordering_confident,
          title_score: w.title_score ?? undefined,
        };
      });
      return {
        resultText: JSON.stringify({
          works,
          total: json.total,
          limit: json.limit,
          offset: json.offset,
        }),
        resultCount: works.length,
        isError: false,
      };
    }
    case "get_work_outline": {
      register(registry, json.doc_id, {
        title: json.title as string,
        author_speaker: json.author_speaker as string,
        collection: json.collection as string,
        source_type: json.source_type as string,
        language: json.language as string,
        publisher: json.publisher as string,
      });
      const map = (json.passage_map as Array<Record<string, unknown>>) ?? [];
      return {
        resultText: JSON.stringify({
          doc_id: json.doc_id,
          title: json.title,
          author: json.author_speaker,
          source_type: json.source_type,
          passage_count: json.passage_count,
          char_count: json.char_count,
          ordering_confident: json.ordering_confident,
          sections: json.sections,
          passage_map: map,
          passage_map_offset: json.passage_map_offset,
          passage_map_truncated: json.passage_map_truncated,
        }),
        resultCount: map.length,
        isError: false,
      };
    }
    case "read_document": {
      register(registry, json.doc_id, {
        title: json.title as string,
        author_speaker: json.author_speaker as string,
        source_type: json.source_type as string,
      });
      const passages = (json.passages as Array<Record<string, unknown>>) ?? [];
      return {
        resultText: JSON.stringify({
          doc_id: json.doc_id,
          title: json.title,
          author: json.author_speaker,
          ordering_confident: json.ordering_confident,
          range_start_passage: json.range_start_passage,
          range_end_passage: json.range_end_passage,
          chars_returned: json.chars_returned,
          total_chars_in_range: json.total_chars_in_range,
          next_char_offset: json.next_char_offset,
          passages: passages,
          text: json.text,
        }),
        resultCount: passages.length,
        isError: false,
      };
    }
    default:
      return { resultText: JSON.stringify(json), isError: false };
  }
}

// ── Timeline helpers ───────────────────────────────────────────────────

/** One-line human summary of a tool call for the research timeline. */
export function summarizeToolInput(
  name: string,
  input: Record<string, unknown>,
  registry: DocRegistry,
): string {
  const i = input ?? {};
  const bits: string[] = [];
  switch (name) {
    case "search_text": {
      bits.push(`"${i.query}"`);
      if (i.mode === "phrase") bits.push("phrase");
      const f = (i.filters ?? {}) as Record<string, unknown>;
      if (f.source_type) bits.push(String(f.source_type));
      if (f.author_prefix) bits.push(String(f.author_prefix));
      break;
    }
    case "search_corpus": {
      bits.push(`"${i.query}"`);
      const f = (i.filters ?? {}) as Record<string, unknown>;
      if (f.category) bits.push(String(f.category));
      if (i.use_reranker) bits.push("reranked");
      break;
    }
    case "list_works": {
      const f = (i.filters ?? {}) as Record<string, unknown>;
      if (f.title_match) bits.push(`title: "${f.title_match}"`);
      if (f.author_prefix) bits.push(`author: ${f.author_prefix}`);
      if (f.collection) bits.push(String(f.collection));
      if (bits.length === 0) bits.push("all works");
      break;
    }
    case "get_work_outline":
    case "read_document": {
      const title = registry.get(String(i.doc_id ?? ""))?.title;
      bits.push(title || String(i.doc_id ?? ""));
      if (name === "read_document") {
        if (i.page_start != null || i.page_end != null) {
          bits.push(`p. ${i.page_start ?? "?"}–${i.page_end ?? i.page_start ?? "?"}`);
        } else if (i.start_passage != null || i.end_passage != null) {
          bits.push(`§${i.start_passage ?? 0}–${i.end_passage ?? "end"}`);
        }
        if (i.char_offset) bits.push(`+${i.char_offset}`);
      }
      break;
    }
    default:
      bits.push(JSON.stringify(i).slice(0, 80));
  }
  const out = bits.join(" · ");
  return out.length > 140 ? out.slice(0, 140) + "…" : out;
}
