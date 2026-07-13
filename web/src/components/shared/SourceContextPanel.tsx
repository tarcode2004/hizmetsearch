import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAction } from "convex/react";
import { api } from "@convex/api";
import { ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { cn, detectArabicScript } from "@/lib/utils";
import { findNormalizedRange, snapToWordBounds } from "@/lib/text-match";
import { cleanCorpusArtifacts } from "@/lib/corpus-clean";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { BACKEND_ENABLED } from "@/lib/env";

/** One char window of the work, as served by actions/sourceContext. */
interface ContextWindow {
  charOffset: number;
  totalChars: number;
  nextCharOffset: number | null;
  text: string;
  passages: Array<{
    ordering: number;
    pageNumber: number | null;
    charStart: number;
  }>;
  orderingConfident: boolean;
}

interface SourceContextPanelProps {
  docId: string;
  /** The retrieved chunk — locates the passage and gets highlighted. */
  chunkText: string;
  /** Known passage ordering (research citations) — skips text location. */
  passageStart?: number | null;
  /** Shown while loading and when context can't be resolved. */
  placeholder: ReactNode;
  /** Applied to the scrollable text container. */
  className?: string;
}

const LOAD_MORE_CHARS = 10_000;

/**
 * Scrollable in-context reading panel: shows the retrieved chunk inside the
 * surrounding work text, with "show earlier / show later" expansion in both
 * directions. Windows come from the corpus tool server via the
 * `actions/sourceContext:getContext` Convex action and stitch losslessly.
 *
 * In static demo mode there's no backend to read from — render just the
 * placeholder (the plain chunk view the caller already had).
 */
export function SourceContextPanel(props: SourceContextPanelProps) {
  if (!BACKEND_ENABLED) return <>{props.placeholder}</>;
  return <LiveSourceContextPanel {...props} />;
}

function LiveSourceContextPanel({
  docId,
  chunkText,
  passageStart,
  placeholder,
  className,
}: SourceContextPanelProps) {
  const { locale } = useTranslation();
  const getContext = useAction(api.sourceContext.getContext);

  const [windows, setWindows] = useState<ContextWindow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading"
  );
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [loadingLater, setLoadingLater] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLElement>(null);
  // Height before a prepend — used to keep the viewport anchored.
  const prependHeightRef = useRef<number | null>(null);
  const centeredRef = useRef(false);

  // ── Initial load (re-runs when the selected source changes) ──────
  useEffect(() => {
    let cancelled = false;
    setWindows([]);
    setStatus("loading");
    centeredRef.current = false;
    getContext({
      docId,
      chunkText: chunkText.slice(0, 600),
      passageStart: passageStart ?? undefined,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setWindows([res]);
          setStatus("ready");
        } else {
          setStatus("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, chunkText, passageStart]);

  const startOffset = windows.length > 0 ? windows[0].charOffset : 0;
  const last = windows.length > 0 ? windows[windows.length - 1] : null;
  const hasEarlier = windows.length > 0 && startOffset > 0;
  const hasLater = last != null && last.nextCharOffset != null;

  const loadEarlier = useCallback(async () => {
    if (!hasEarlier || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const limit = Math.min(LOAD_MORE_CHARS, startOffset);
      const offset = startOffset - limit;
      const res = await getContext({ docId, charOffset: offset, charLimit: limit });
      if (res.ok) {
        // Separator snapping can make the window run past our existing
        // start by a couple of chars — trim the overlap off its tail so
        // the stitched text stays lossless.
        const windowEnd = res.nextCharOffset ?? res.charOffset + res.text.length;
        const overlap = windowEnd - startOffset;
        const text =
          overlap > 0 ? res.text.slice(0, res.text.length - overlap) : res.text;
        prependHeightRef.current = containerRef.current?.scrollHeight ?? null;
        setWindows((ws) => [{ ...res, text, nextCharOffset: startOffset }, ...ws]);
      }
    } finally {
      setLoadingEarlier(false);
    }
  }, [docId, getContext, hasEarlier, loadingEarlier, startOffset]);

  const loadLater = useCallback(async () => {
    if (!hasLater || loadingLater || last?.nextCharOffset == null) return;
    setLoadingLater(true);
    try {
      const res = await getContext({
        docId,
        charOffset: last.nextCharOffset,
        charLimit: LOAD_MORE_CHARS,
      });
      if (res.ok) setWindows((ws) => [...ws, res]);
    } finally {
      setLoadingLater(false);
    }
  }, [docId, getContext, hasLater, loadingLater, last]);

  // Center the highlighted chunk after the first window renders.
  useLayoutEffect(() => {
    if (status !== "ready" || centeredRef.current) return;
    const c = containerRef.current;
    const el = markRef.current;
    if (!c) return;
    centeredRef.current = true;
    if (!el) return;
    const cRect = c.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    c.scrollTop = Math.max(
      0,
      c.scrollTop + (eRect.top - cRect.top) - cRect.height / 2 + eRect.height / 2
    );
  }, [status, windows]);

  // Keep the viewport anchored after a prepend.
  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c || prependHeightRef.current == null) return;
    c.scrollTop += c.scrollHeight - prependHeightRef.current;
    prependHeightRef.current = null;
  }, [windows]);

  if (status !== "ready") {
    return (
      <div className="space-y-2">
        {placeholder}
        {status === "loading" && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {locale === "tr" ? "Bağlam yükleniyor…" : "Loading context…"}
          </div>
        )}
      </div>
    );
  }

  // Repair PDF-extraction artifacts ("# " line markers, split drop-caps)
  // for DISPLAY. The needle gets the same treatment so matching still
  // works; highlight bounds snap outward so char-window chunk cuts don't
  // sever words ("ECOND SUBTLETY…").
  const rawStitched = windows.map((w) => w.text).join("");
  const stitched = cleanCorpusArtifacts(rawStitched);
  const artifactsRepaired = stitched !== rawStitched;
  const rawHighlight = findNormalizedRange(
    stitched,
    cleanCorpusArtifacts(chunkText),
  );
  const highlight = rawHighlight && snapToWordBounds(stitched, rawHighlight);
  const isArabic = detectArabicScript(chunkText || stitched);
  const orderingConfident = windows.every((w) => w.orderingConfident);

  // Absolute passage starts within the stitched text, for page markers.
  // Artifact repair shifts offsets, so markers only render for clean
  // works (where the text is byte-identical and offsets stay valid) —
  // the artifact-affected works carry no page numbers anyway.
  const pageMarks: Array<{ at: number; page: number }> = [];
  if (!artifactsRepaired) {
    let prefix = 0;
    let lastPage: number | null = null;
    for (const w of windows) {
      for (const p of w.passages) {
        const at = prefix + p.charStart;
        if (p.pageNumber != null && p.pageNumber !== lastPage) {
          if (at > 0) pageMarks.push({ at, page: p.pageNumber });
          lastPage = p.pageNumber;
        }
      }
      prefix += w.text.length;
    }
  }

  // Split the stitched text at highlight bounds + page-marker positions.
  const cuts = new Set<number>([0, stitched.length]);
  if (highlight) {
    cuts.add(highlight.start);
    cuts.add(highlight.end);
  }
  for (const m of pageMarks) cuts.add(m.at);
  const points = [...cuts].sort((a, b) => a - b);
  const markAt = new Map(pageMarks.map((m) => [m.at, m.page]));

  const nodes: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const page = markAt.get(a);
    if (page != null) {
      nodes.push(
        <span
          key={`pg-${a}`}
          className="mx-1 inline-block select-none rounded border border-border/60 bg-muted/50 px-1 py-px align-middle text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
          title={locale === "tr" ? `Sayfa ${page}` : `Page ${page}`}
        >
          s. {page}
        </span>
      );
    }
    const slice = stitched.slice(a, b);
    if (!slice) continue;
    const inHighlight = highlight && a >= highlight.start && b <= highlight.end;
    nodes.push(
      inHighlight ? (
        <mark
          key={a}
          ref={a === highlight!.start ? (el) => {
            markRef.current = el;
          } : undefined}
          className="rounded bg-amber-200/70 px-0.5 -mx-0.5 text-inherit dark:bg-amber-500/25"
        >
          {slice}
        </mark>
      ) : (
        <span key={a}>{slice}</span>
      )
    );
  }

  const moreButton = (
    dir: "earlier" | "later",
    onClick: () => void,
    loading: boolean
  ) => (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border/70 bg-muted/30 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : dir === "earlier" ? (
        <ChevronUp className="h-3 w-3" />
      ) : (
        <ChevronDown className="h-3 w-3" />
      )}
      {dir === "earlier"
        ? locale === "tr"
          ? "Öncesini göster"
          : "Show earlier text"
        : locale === "tr"
          ? "Devamını göster"
          : "Show later text"}
    </button>
  );

  return (
    <div className="space-y-1.5">
      {!orderingConfident && (
        <p className="text-[10px] italic leading-snug text-muted-foreground/80">
          {locale === "tr"
            ? "Bu eserde bölüm sırası kesin değil — çevre metin yaklaşık sırayla gösteriliyor."
            : "Passage order in this work isn't certain — surrounding text is shown in approximate order."}
        </p>
      )}
      <div
        ref={containerRef}
        dir={isArabic ? "rtl" : "ltr"}
        className={cn(
          "overflow-y-auto rounded-lg border border-border/60 bg-background/50 p-3 text-[13px] leading-relaxed text-foreground/85",
          isArabic && "font-[var(--font-arabic)] text-base",
          className
        )}
      >
        {hasEarlier && (
          <div className="mb-2">{moreButton("earlier", loadEarlier, loadingEarlier)}</div>
        )}
        <div className="whitespace-pre-line">{nodes}</div>
        {hasLater && (
          <div className="mt-2">{moreButton("later", loadLater, loadingLater)}</div>
        )}
      </div>
    </div>
  );
}
