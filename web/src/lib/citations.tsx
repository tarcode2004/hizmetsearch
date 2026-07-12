import React, { createElement } from "react";
import type { Components } from "react-markdown";
import type { ChunkResult } from "@/lib/types";

/**
 * Shared citation pipeline for AI-generated answers (search AIAnswer +
 * chat MessageBubble).
 *
 * CommonMark interprets `[5]` as a shortcut reference link and either
 * strips the brackets or eats the markup entirely when no matching link
 * definition exists, so by the time our React components see the children
 * the `[N]` markers are already mangled. We therefore swap citations for
 * private-use Unicode placeholders BEFORE handing the text to
 * ReactMarkdown, then walk the parsed tree and swap them back into chips.
 *
 * Recognized citation shapes (see docs/RANKING_AND_CHUNKING_PLAN.md §2):
 *   [1]              single
 *   [1][2]           adjacent (handled by chained matches)
 *   [1, 2, 3]        comma list — expanded into 3 separate chips
 *   [1-3]            range — expanded into 1, 2, 3 (also – and — dashes)
 *   [Source 1]       prose form — normalized to [1]
 *   [Sources 1, 2]   plural prose form
 *   [Kaynak 3]       Turkish prose form (+ Kaynaklar)
 */
export const CITE_OPEN = "\uE000";
export const CITE_CLOSE = "\uE001";

/** Fresh regex each call — the `g` flag makes RegExp objects stateful. */
export function citePlaceholderRe(): RegExp {
  return new RegExp(`${CITE_OPEN}(\\d+)${CITE_CLOSE}`, "g");
}

/** True if the string still contains un-swapped citation placeholders.
 *  Used by tests to assert no "NOGLYPH" tofu can reach the DOM. */
export function containsCitationPlaceholder(text: string): boolean {
  return text.includes(CITE_OPEN) || text.includes(CITE_CLOSE);
}

export function expandRangeOrList(inner: string): number[] {
  const out: number[] = [];
  for (const part of inner.split(/\s*,\s*/)) {
    const range = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a <= b && b - a < 20) {
        for (let i = a; i <= b; i++) out.push(i);
        continue;
      }
    }
    const single = part.match(/^\d+$/);
    if (single) out.push(Number(single[0]));
  }
  return out;
}

/**
 * Replace every bracketed citation with placeholder-wrapped numbers.
 * Brackets that don't parse into at least one number are left untouched
 * (so e.g. regular markdown links survive).
 */
export function preprocessCitations(text: string): string {
  // The trailing `(?!\()` keeps markdown links whose text is a bare
  // number — "[1](https://x)" — from being mangled into a chip
  // followed by a literal "(https://x)".
  return text.replace(
    /\[\s*(?:sources?|src|kaynak(?:lar)?)?\s*:?\s*([\d,\s\-–—]+)\s*\](?!\()/gi,
    (match, inner: string) => {
      const nums = expandRangeOrList(inner);
      if (nums.length === 0) return match;
      return nums.map((n) => `${CITE_OPEN}${n}${CITE_CLOSE}`).join("");
    },
  );
}

/** Builds the chip element for one citation number. Provided by the host
 *  component (AIAnswer / MessageBubble) since click behavior differs. */
export type MakeChip = (num: number, key: string) => React.ReactNode;

/** Walk a plain string and replace each placeholder with a chip. */
export function renderCitedText(
  text: string,
  makeChip: MakeChip,
  baseKey: string,
): React.ReactNode[] {
  // Splitting with a capture group puts captured groups at odd indices.
  const parts = text.split(citePlaceholderRe());
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return makeChip(parseInt(part, 10), `${baseKey}-c${i}`);
    }
    return part ? (
      <React.Fragment key={`${baseKey}-t${i}`}>{part}</React.Fragment>
    ) : null;
  });
}

/**
 * Recursively walk a React children tree and run `renderCitedText` on
 * every string node. Handles arrays of mixed text + inline markup and
 * recurses into element children (em, strong, code, a, del, …) so chips
 * survive arbitrary nesting. Idempotent: already-built chips pass
 * through unchanged.
 */
export function renderCitedChildren(
  children: React.ReactNode,
  makeChip: MakeChip,
  baseKey: string,
): React.ReactNode {
  if (typeof children === "string") {
    return renderCitedText(children, makeChip, baseKey);
  }
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      renderCitedChildren(c, makeChip, `${baseKey}-${i}`),
    );
  }
  if (React.isValidElement(children)) {
    const el = children as React.ReactElement<{ children?: React.ReactNode }>;
    if (el.props.children == null) return children;
    return React.cloneElement(el, {
      children: renderCitedChildren(el.props.children, makeChip, `${baseKey}-x`),
    });
  }
  return children;
}

/**
 * Every element type ReactMarkdown can emit that may contain phrasing
 * text. Any of these NOT given an explicit styled handler by the host
 * component gets a generic pass-through handler that still runs the
 * citation walker — this is the fix for the NOGLYPH leak: previously a
 * placeholder inside an unhandled node (e.g. `#### heading [1]`) was
 * rendered verbatim as private-use tofu.
 *
 * Includes the GFM set (del, table cells) so enabling remark-gfm later
 * cannot re-open the leak.
 */
const CITED_FALLTHROUGH_TAGS = [
  "a",
  "blockquote",
  "caption",
  "code",
  "dd",
  "del",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "p",
  "pre",
  "span",
  "strong",
  "td",
  "th",
] as const;

type FallthroughProps = React.HTMLAttributes<HTMLElement> & {
  node?: unknown;
  children?: React.ReactNode;
};

/**
 * Extend a styled ReactMarkdown components map with citation-aware
 * fallthrough handlers for every text-bearing element the host didn't
 * style explicitly. The styled handlers are expected to call
 * `renderCitedChildren` themselves.
 */
export function withCitationFallthrough(
  styled: Components,
  makeChip: MakeChip,
): Components {
  const out: Record<string, unknown> = { ...styled };
  for (const tag of CITED_FALLTHROUGH_TAGS) {
    if (out[tag]) continue;
    const Fallthrough = (props: FallthroughProps) => {
      const { node: _node, children, ...rest } = props;
      void _node;
      return createElement(
        tag,
        rest,
        renderCitedChildren(children, makeChip, `ft-${tag}`),
      );
    };
    Fallthrough.displayName = `CitedFallthrough(${tag})`;
    out[tag] = Fallthrough;
  }
  return out as Components;
}

// ── Source display helpers (T4 agentic source format) ───────────────────

/** True for sources persisted by the Sonnet 5 research loop (T4): their
 *  chunk_id is synthetic (`research:{doc_id}:{n}`) and they carry a
 *  human-readable locator in `chapter_section` plus passage_start/_end. */
export function isResearchSource(src: ChunkResult): boolean {
  return src.chunk_id.startsWith("research:");
}

/** Research sources have no `source_url` — the doc registry that enriches
 *  them (convex/lib/agentTools.ts DocMeta) doesn't carry one — so the
 *  source viewer cannot fetch the underlying file for them. */
export function sourceHasViewerFile(src: ChunkResult): boolean {
  return !!src.source_url;
}

/**
 * Clean a display title. The corpus catalog contains duplicate-edition
 * artifacts with junk trailing separators (observed: a work titled
 * "RHD-1 -"). Strips trailing dashes/dots/pipes and collapses whitespace.
 */
export function cleanSourceTitle(title: string): string {
  const cleaned = title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s\-–—·:|,;.]+$/, "")
    .trim();
  return cleaned || title.trim();
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Human-readable locator bits for a source, research-format aware.
 *
 * Research sources already carry a composed locator in `chapter_section`
 * ("s. 12–15 · §3–5" — built server-side from page/passage ranges), which
 * subsumes `page_number`, so we must NOT also print "p. 12". Classic
 * retrieval sources get the legacy chapter + page/timestamp treatment.
 */
export function formatSourceLocator(src: ChunkResult): string[] {
  const bits: string[] = [];
  if (isResearchSource(src)) {
    if (src.chapter_section) {
      bits.push(src.chapter_section);
    } else if (src.page_number != null) {
      bits.push(`s. ${src.page_number}`);
    } else if (src.passage_start != null) {
      bits.push(
        src.passage_end != null && src.passage_end !== src.passage_start
          ? `§${src.passage_start}–${src.passage_end}`
          : `§${src.passage_start}`,
      );
    }
    if (src.timestamp_start != null) {
      bits.push(formatTimestamp(src.timestamp_start));
    }
    return bits;
  }
  if (src.chapter_section) bits.push(src.chapter_section);
  if (src.page_number != null) bits.push(`p. ${src.page_number}`);
  else if (src.timestamp_start != null) {
    bits.push(formatTimestamp(src.timestamp_start));
  }
  return bits;
}

/**
 * The model's true citation number for a research source, parsed back out
 * of the synthetic chunk_id (`research:{doc_id}:{n}`).
 *
 * The research loop persists a dense, n-sorted array but does NOT
 * renumber the inline [N] markers in the answer text; when the model
 * numbered non-contiguously (n: 1, 3) or a malformed entry was dropped,
 * positional lookup (`sources[N-1]`) silently misattributes every later
 * chip — wrong work, wrong quote, wrong deep link. Resolving by this
 * persisted n keeps chips correct for new AND historical messages.
 * Returns undefined for classic retrieval sources (which are contiguous
 * by construction and resolve positionally).
 */
export function researchCitationNumber(src: ChunkResult): number | undefined {
  if (!isResearchSource(src)) return undefined;
  const m = /:(\d+)$/.exec(src.chunk_id);
  return m ? Number(m[1]) : undefined;
}

/**
 * Find the source cited as [num]. Research sources resolve strictly by
 * their persisted n; classic retrieval sources resolve positionally.
 * Returns undefined when nothing matches — the chip renders inert
 * rather than pointing at the wrong work.
 */
function findCitedSource(
  sources: ChunkResult[] | undefined,
  num: number,
): ChunkResult | undefined {
  if (!sources) return undefined;
  const byN = sources.find((s) => researchCitationNumber(s) === num);
  if (byN) return byN;
  const positional = sources[num - 1];
  if (!positional) return undefined;
  // Never positionally resolve a research source under a different n —
  // that is exactly the misattribution failure mode.
  const n = researchCitationNumber(positional);
  if (n !== undefined && n !== num) return undefined;
  return positional;
}

/**
 * Resolve the source for citation [num] (see `findCitedSource`), then
 * backfill missing display metadata from a sibling entry that cites the
 * same work (same doc_id). The research loop occasionally persists two
 * entries for one work where only one got registry-enriched metadata
 * (the duplicate-edition artifact).
 */
export function resolveSourceDisplay(
  sources: ChunkResult[] | undefined,
  num: number,
): ChunkResult | undefined {
  const src = findCitedSource(sources, num);
  if (!src) return undefined;
  if (src.title && src.author_speaker) return src;
  const sibling = sources?.find(
    (s) => s !== src && s.doc_id === src.doc_id && s.title,
  );
  if (!sibling) return src;
  return {
    ...src,
    title: src.title || sibling.title,
    author_speaker: src.author_speaker || sibling.author_speaker,
    publisher: src.publisher || sibling.publisher,
  };
}

export interface MergedSourceEntry {
  /** Representative source (first entry for the work, metadata backfilled). */
  source: ChunkResult;
  /** 1-based citation numbers pointing at this work. */
  numbers: number[];
  /** Distinct locator strings across the merged entries. */
  locators: string[];
}

/**
 * Merge research-source entries that cite the same work (same doc_id)
 * into one display row carrying all citation numbers and the union of
 * locators. Classic retrieval sources are never merged — distinct chunks
 * from one work are legitimately distinct snippets there.
 */
export function mergeSourceEntries(sources: ChunkResult[]): MergedSourceEntry[] {
  const out: MergedSourceEntry[] = [];
  const byDoc = new Map<string, MergedSourceEntry>();
  sources.forEach((src, i) => {
    // Research entries display the model's true citation number (parsed
    // from chunk_id) so the rows match the inline chips even when the
    // model numbered non-contiguously; classic chunks are positional.
    const num = researchCitationNumber(src) ?? i + 1;
    const canMerge = isResearchSource(src) && !!src.doc_id;
    const existing = canMerge ? byDoc.get(src.doc_id) : undefined;
    const locator = formatSourceLocator(src).join(" · ");
    if (existing) {
      existing.numbers.push(num);
      if (locator && !existing.locators.includes(locator)) {
        existing.locators.push(locator);
      }
      if (!existing.source.title && src.title) {
        existing.source = {
          ...existing.source,
          title: src.title,
          author_speaker: existing.source.author_speaker || src.author_speaker,
        };
      }
      return;
    }
    const entry: MergedSourceEntry = {
      source: resolveSourceDisplay(sources, num) ?? src,
      numbers: [num],
      locators: locator ? [locator] : [],
    };
    if (canMerge) byDoc.set(src.doc_id, entry);
    out.push(entry);
  });
  return out;
}
