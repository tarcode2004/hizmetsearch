import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { Kbd } from "@/components/ui/Kbd";
import { cn } from "@/lib/utils";

interface PdfViewerProps {
  sourceUrl: string;
  /** Currently displayed page — controlled by the parent so outline
   *  clicks and the toolbar stay in sync. */
  page: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  /** Text snippet to highlight inside the PDF. Forwarded to the
   *  browser PDF viewer via the `#search=` open parameter (Chrome's
   *  native viewer supports this). Useful when the chunk has no
   *  reliable page number — the search jumps to whatever page
   *  contains the snippet. */
  searchText?: string;
  /** Bumped each time the user clicks "jump to chunk" so we can force
   *  the iframe to remount even when page + searchText are unchanged. */
  jumpNonce?: number;
}

/**
 * PDF document pane for the new source viewer.
 *
 * Loads the PDF into an iframe using browser-native rendering (honors
 * `#page=N&view=FitH` anchor). Fully controlled: the parent owns the
 * current page state so that clicking an outline entry or pressing
 * prev/next all use the same source of truth.
 */
export function PdfViewer({
  sourceUrl,
  page: currentPage,
  totalPages,
  onPageChange,
  searchText,
  jumpNonce = 0,
}: PdfViewerProps) {
  const [zoom, setZoom] = useState<"auto" | number>("auto");
  const [pageInput, setPageInput] = useState(String(currentPage));
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const iframeSrc = useMemo(() => {
    // Build PDF Open Parameters fragment.
    // - `page=N` jumps to page N (browsers honor this for native PDF rendering)
    // - `search=...` triggers in-PDF text search and highlights matches
    // - `toolbar=1` keeps the search bar visible so users see the highlights
    // - `view=FitH` fits to width
    // We turn the toolbar BACK ON when there's a search snippet so the
    // user gets the visual hit-counter and can step through matches.
    const params: string[] = [`page=${currentPage}`];
    if (zoom === "auto") {
      params.push("view=FitH");
    } else {
      params.push(`zoom=${zoom}`);
    }
    const showToolbar = !!searchText;
    params.push(`toolbar=${showToolbar ? 1 : 0}`);
    params.push("navpanes=0");
    if (searchText) {
      // Use just the first ~80 chars — Chrome's PDF viewer search picks
      // up the longest substring match it can find. Strip line breaks
      // and trim to a sentence-ish boundary so we don't search on
      // mid-word fragments.
      const cleaned = searchText
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      params.push(`search=${encodeURIComponent(cleaned)}`);
    }
    // Bake the nonce into the URL fragment. Without this, clicking
    // "jump to chunk" when page+searchText are unchanged produces an
    // identical iframeSrc string, the `key={iframeSrc}` below no-ops,
    // and the iframe never remounts — so the in-PDF search never re-runs.
    if (jumpNonce) params.push(`_n=${jumpNonce}`);
    return `${sourceUrl}#${params.join("&")}`;
  }, [sourceUrl, currentPage, zoom, searchText, jumpNonce]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const goToPage = (p: number) => {
    const clamped = totalPages
      ? Math.max(1, Math.min(totalPages, p))
      : Math.max(1, p);
    onPageChange(clamped);
  };

  const handlePageInput = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(pageInput, 10);
    if (!isNaN(n)) goToPage(n);
  };

  return (
    <div className="relative flex h-full w-full min-h-0 flex-col">
      <iframe
        ref={iframeRef}
        key={iframeSrc}
        src={iframeSrc}
        title="PDF"
        className="h-full w-full border-0 bg-muted/30"
      />

      {/* ─── Floating overlay toolbar ─── */}
      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2",
          "flex items-center gap-0.5 rounded-xl border border-border bg-card/95 backdrop-blur-md px-2 py-1.5",
          "shadow-[var(--shadow-md)]"
        )}
      >
        <Tooltip content="Previous page" side="bottom">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </Tooltip>

        <form
          onSubmit={handlePageInput}
          className="pointer-events-auto flex items-center gap-1"
        >
          <input
            type="text"
            inputMode="numeric"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={handlePageInput}
            className="w-10 rounded-md bg-muted/50 px-2 py-1 text-center font-mono text-xs outline-none focus:bg-muted focus:ring-1 focus:ring-primary"
            aria-label="Current page"
          />
          {totalPages && (
            <span className="text-xs font-mono text-muted-foreground">
              / {totalPages}
            </span>
          )}
        </form>

        <Tooltip content="Next page" side="bottom">
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={!!totalPages && currentPage >= totalPages}
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </Tooltip>

        <div className="mx-1 h-4 w-px bg-border" />

        <Tooltip content="Zoom out" side="bottom">
          <button
            onClick={() =>
              setZoom((z) =>
                typeof z === "number" ? Math.max(50, z - 25) : 100
              )
            }
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
        </Tooltip>

        <span className="min-w-[3rem] text-center text-xs font-mono text-muted-foreground">
          {zoom === "auto" ? "Fit" : `${zoom}%`}
        </span>

        <Tooltip content="Zoom in" side="bottom">
          <button
            onClick={() =>
              setZoom((z) =>
                typeof z === "number" ? Math.min(400, z + 25) : 125
              )
            }
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </Tooltip>

        <div className="mx-1 h-4 w-px bg-border" />

        <Tooltip content="Download" side="bottom">
          <a
            href={sourceUrl}
            download
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Download PDF"
          >
            <Download className="h-4 w-4" />
          </a>
        </Tooltip>

        <Tooltip content="Open in new tab" side="bottom">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </Tooltip>
      </div>

      {/* Keyboard hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-md bg-card/70 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur opacity-50 hover:opacity-100 transition-opacity">
        <Kbd>⌘F</Kbd>
        <span>to find text</span>
      </div>
    </div>
  );
}

/**
 * Scan a PDF page-by-page until we find one whose extracted text
 * contains a snippet from the chunk. Used by the viewer when a chunk
 * has no `page_number` recorded (audio backfills, OCR with bad
 * pagination, older ingestion runs) so we can still jump the user
 * to the right page on click. Returns null if not found.
 *
 * Strategy: extract several distinctive ~40-char substrings from the
 * chunk (start, mid, last identifiable phrase) and try each. PDF text
 * extraction often inserts spaces or breaks words in unpredictable
 * places, so a long verbatim match is brittle — multiple short probes
 * are more robust. We also strip non-alphanumerics so the match isn't
 * tripped up by punctuation differences between the chunk text and
 * the PDF's text layer.
 */
export async function findPageWithText(
  sourceUrl: string,
  snippet: string,
): Promise<number | null> {
  if (!snippet || snippet.length < 12) return null;
  console.log("[findPageWithText] start", { url: sourceUrl, snippetLen: snippet.length });
  try {
    const pdfjsLib = await import("pdfjs-dist");
    const workerSrc = (
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    const doc = await pdfjsLib.getDocument(sourceUrl).promise;
    console.log("[findPageWithText] PDF loaded", { numPages: doc.numPages });

    // Aggressive normalization: strip everything except letters/digits
    // and lowercase. This tolerates whitespace differences, punctuation
    // mismatches, and most typographic variants between the chunk text
    // and the PDF text layer.
    const norm = (s: string) =>
      s
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^a-z0-9çğıöşüâîû]/giu, "");

    const normSnippet = norm(snippet);
    if (normSnippet.length < 20) return null;

    // Build 4 probe substrings from different positions in the chunk.
    // Length 40 is the sweet spot — long enough to be distinctive,
    // short enough to survive PDF line breaks.
    const probeLen = 40;
    const probes: string[] = [];
    const positions = [
      0,
      Math.floor(normSnippet.length * 0.25),
      Math.floor(normSnippet.length * 0.5),
      Math.floor(normSnippet.length * 0.75),
    ];
    for (const start of positions) {
      const end = Math.min(start + probeLen, normSnippet.length);
      if (end - start >= 30) probes.push(normSnippet.slice(start, end));
    }
    console.log("[findPageWithText] probes", probes);

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageText = norm(
        (content.items as Array<{ str?: string }>)
          .map((it) => it.str ?? "")
          .join(" "),
      );
      for (const probe of probes) {
        if (pageText.includes(probe)) {
          console.log("[findPageWithText] hit", { page: p, probeLen: probe.length });
          return p;
        }
      }
    }
    console.log("[findPageWithText] no match across", doc.numPages, "pages");
    return null;
  } catch (err) {
    console.warn("[findPageWithText] failed:", err);
    return null;
  }
}

/**
 * Attempt to extract the PDF outline (TOC) and total pages via pdfjs-dist.
 * Returns null on failure — the caller should show "no outline available."
 */
export async function extractPdfMetadata(sourceUrl: string): Promise<{
  numPages: number;
  outline: Array<{ title: string; page: number; depth: number }>;
} | null> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    // Worker is served by Vite from pdfjs-dist
    const workerSrc = (
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

    const doc = await pdfjsLib.getDocument(sourceUrl).promise;
    const numPages = doc.numPages;

    const rawOutline = await doc.getOutline();

    const entries: Array<{ title: string; page: number; depth: number }> = [];

    const walk = async (
      nodes: Array<{
        title: string;
        dest?: string | unknown[] | null;
        items?: unknown[];
      }>,
      depth: number
    ): Promise<void> => {
      for (const node of nodes) {
        let page = 1;
        try {
          let dest = node.dest;
          if (typeof dest === "string") {
            dest = await doc.getDestination(dest);
          }
          if (Array.isArray(dest) && dest[0]) {
            const pageIndex = await doc.getPageIndex(dest[0] as never);
            page = pageIndex + 1;
          }
        } catch {
          /* keep default */
        }
        entries.push({ title: node.title, page, depth });
        if (node.items && node.items.length > 0) {
          await walk(
            node.items as Array<{
              title: string;
              dest?: string | unknown[] | null;
              items?: unknown[];
            }>,
            depth + 1
          );
        }
      }
    };

    if (rawOutline && rawOutline.length > 0) {
      await walk(
        rawOutline as Array<{
          title: string;
          dest?: string | unknown[] | null;
          items?: unknown[];
        }>,
        0
      );
    }

    // Fallback: the source PDFs in this corpus were authored / OCR'd
    // without /Outlines, /Bookmarks or /Dests, so `getOutline()` returns
    // null or empty for nearly every document. Synthesize a TOC by
    // sampling text on each page and detecting headings via:
    //   1. Pattern match on common Turkish/English chapter markers
    //      (BÖLÜM, FASIL, KISIM, BAB, BİRİNCİ-ONUNCU ŞUÂ, CHAPTER, etc.)
    //   2. Lines whose font height is ≥1.4× the page's median font.
    //   3. Short ALL-CAPS lines (≤8 words) that aren't headers/footers.
    //
    // This is best-effort — false positives are acceptable because the
    // user can still navigate via page input. Empty fallback is fine
    // too: the OutlinePanel already shows a "no TOC" message.
    if (entries.length === 0) {
      const synthesized = await synthesizeOutlineFromText(doc, numPages);
      return { numPages, outline: synthesized };
    }

    return { numPages, outline: entries };
  } catch (err) {
    console.warn("PDF outline extraction failed:", err);
    return null;
  }
}

/**
 * Generate a synthetic TOC by scanning the PDF text layer for heading-like
 * lines. Used as a fallback when the PDF has no embedded outline. Cheap:
 * one `getTextContent()` per page, no rasterization.
 *
 * Heuristics tuned for the HizmetSearch corpus (Turkish religious texts,
 * Risale-i Nur, Hocaefendi books, publisher PDFs):
 *  - "BÖLÜM N", "FASIL N", "KISIM N", "BAB N", "BÖLÜM 1", "1. BÖLÜM"
 *  - "{ORDINAL} ŞUÂ" / "{ORDINAL} SÖZ" / "{ORDINAL} MEKTUP" / "{ORDINAL} LEMA"
 *  - All-caps lines of 2-8 words that are NOT page numbers or running headers
 *  - Lines with significantly larger font height than the page median
 */
async function synthesizeOutlineFromText(
  doc: { numPages: number; getPage: (n: number) => Promise<unknown> },
  numPages: number
): Promise<Array<{ title: string; page: number; depth: number }>> {
  const out: Array<{ title: string; page: number; depth: number }> = [];

  // Cap scan at 800 pages to keep cold loads fast on huge books.
  const MAX_PAGES_TO_SCAN = Math.min(numPages, 800);

  // Patterns: depth=0 for top-level chapter markers, depth=1 for ordinals.
  const TURKISH_ORDINALS = [
    "BİRİNCİ", "İKİNCİ", "ÜÇÜNCÜ", "DÖRDÜNCÜ", "BEŞİNCİ",
    "ALTINCI", "YEDİNCİ", "SEKİZİNCİ", "DOKUZUNCU", "ONUNCU",
    "ON BİRİNCİ", "ON İKİNCİ", "ON ÜÇÜNCÜ", "ON DÖRDÜNCÜ", "ON BEŞİNCİ",
  ];
  const SECTION_TYPES = ["ŞUÂ", "ŞUA", "SÖZ", "MEKTUP", "LEM'A", "LEMA", "MESELE", "BAB", "BÖLÜM", "FASIL", "KISIM"];
  const ordinalSection = new RegExp(
    `^(${TURKISH_ORDINALS.join("|")})\\s+(${SECTION_TYPES.join("|")})\\b`,
    "i"
  );
  const numberedChapter = /^(?:(?:\d{1,2})\.\s*)?(BÖLÜM|FASIL|KISIM|BAB|CHAPTER|SECTION)\s*(?:[-:]?\s*\d{1,3}|[IVX]+)?/i;

  // Track recently-seen lines so we can suppress running headers/footers
  // (a line that appears on >30% of pages is almost certainly a header).
  const lineFreq = new Map<string, number>();

  // First pass: collect candidate headings + line frequency.
  type Cand = { title: string; page: number; depth: number; size: number };
  const candidates: Cand[] = [];

  for (let p = 1; p <= MAX_PAGES_TO_SCAN; p++) {
    let textContent;
    try {
      const page = (await doc.getPage(p)) as {
        getTextContent: () => Promise<{ items: unknown[] }>;
      };
      textContent = await page.getTextContent();
    } catch {
      continue;
    }

    type Item = { str?: string; height?: number; transform?: number[] };
    const items = (textContent.items as Item[]).filter((it) => (it.str ?? "").trim().length > 0);
    if (items.length === 0) continue;

    // Page median font height (use transform[3] which is the y-scale, more
    // reliable than `.height` across pdfjs versions).
    const sizes = items
      .map((it) => Math.abs(it.transform?.[3] ?? it.height ?? 0))
      .filter((s) => s > 0)
      .sort((a, b) => a - b);
    const medianSize = sizes.length > 0 ? sizes[Math.floor(sizes.length / 2)] : 10;

    // Group adjacent items into "lines" (same y-coordinate within 2px).
    const lines: Array<{ text: string; size: number }> = [];
    let currentLine: { text: string; size: number; y: number } | null = null;
    for (const it of items) {
      const y = it.transform?.[5] ?? 0;
      const size = Math.abs(it.transform?.[3] ?? it.height ?? medianSize);
      const str = (it.str ?? "").trim();
      if (!str) continue;
      if (currentLine && Math.abs(y - currentLine.y) < 2) {
        currentLine.text += " " + str;
        currentLine.size = Math.max(currentLine.size, size);
      } else {
        if (currentLine) lines.push({ text: currentLine.text, size: currentLine.size });
        currentLine = { text: str, size, y };
      }
    }
    if (currentLine) lines.push({ text: currentLine.text, size: currentLine.size });

    for (const ln of lines) {
      const txt = ln.text.replace(/\s+/g, " ").trim();
      if (txt.length < 3 || txt.length > 100) continue;
      lineFreq.set(txt, (lineFreq.get(txt) ?? 0) + 1);

      // Pattern matches first (highest confidence)
      if (ordinalSection.test(txt)) {
        candidates.push({ title: txt, page: p, depth: 1, size: ln.size });
        continue;
      }
      if (numberedChapter.test(txt)) {
        candidates.push({ title: txt, page: p, depth: 0, size: ln.size });
        continue;
      }
      // Font-size heading: ≥1.4× page median, short, capitalized
      if (ln.size >= medianSize * 1.4 && txt.length <= 80) {
        const wordCount = txt.split(/\s+/).length;
        if (wordCount <= 12 && /[A-Za-zÇĞİÖŞÜ]/.test(txt)) {
          candidates.push({ title: txt, page: p, depth: 0, size: ln.size });
        }
      }
    }
  }

  // Suppress lines that appear on >30% of scanned pages (running headers).
  const headerCutoff = Math.max(3, MAX_PAGES_TO_SCAN * 0.3);
  const cleaned = candidates.filter((c) => (lineFreq.get(c.title) ?? 0) < headerCutoff);

  // Dedupe consecutive identical entries.
  for (const c of cleaned) {
    const last = out[out.length - 1];
    if (!last || last.title !== c.title || last.page !== c.page) {
      out.push({ title: c.title, page: c.page, depth: c.depth });
    }
  }

  // Cap entries — past 200, the panel becomes useless.
  return out.slice(0, 200);
}
