import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { FileQuestion, ArrowLeft, BookOpen } from "lucide-react";
import { getViewerKind, parseSourcePathTrail } from "@/lib/source-viewer";
import { cleanSourceTitle, formatTimestamp } from "@/lib/citations";
import { cn, detectArabicScript } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { ViewerHeader } from "@/components/viewer/ViewerHeader";
import { PdfViewer, extractPdfMetadata, findPageWithText } from "@/components/viewer/PdfViewer";
import { TextViewer } from "@/components/viewer/TextViewer";
import { AudioViewer } from "@/components/viewer/AudioViewer";
import { VideoViewer } from "@/components/viewer/VideoViewer";
import { ViewerLayout } from "@/components/viewer/ViewerLayout";
import { OutlinePanel, type OutlineEntry } from "@/components/viewer/OutlinePanel";
import { ChunkPanel } from "@/components/viewer/ChunkPanel";
import { SourceContextPanel } from "@/components/shared/SourceContextPanel";

/**
 * Standalone source viewer route. Opens in a new tab when a user clicks
 * a source card or citation. All context comes from URL query params,
 * so the page is fully shareable.
 */
export function SourceViewerPage() {
  const { t } = useTranslation();
  const { docId } = useParams<{ docId: string }>();
  const [params] = useSearchParams();

  // Numeric query param, or null when absent/garbage — a malformed
  // param must never surface as "§NaN" / "p. NaN" in the viewer chrome.
  const numParam = (value: string | null): number | null => {
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const meta = useMemo(
    () => ({
      docId: docId ?? "",
      chunkId: params.get("chunk") ?? "",
      sourceUrl: params.get("src"),
      sourceExt: params.get("ext"),
      sourceType: params.get("type"),
      page: numParam(params.get("page")),
      timestampStart: numParam(params.get("ts")),
      timestampEnd: numParam(params.get("te")),
      charOffset: numParam(params.get("off")),
      passageStart: numParam(params.get("ps")),
      passageEnd: numParam(params.get("pe")),
      title: params.get("title") ?? "",
      author: params.get("author"),
      section: params.get("section"),
      collection: params.get("col"),
      language: params.get("lang"),
      chunkText: params.get("q") ?? "",
    }),
    [docId, params]
  );

  const kind = getViewerKind(meta.sourceType, meta.sourceExt);

  // ─── PDF outline state ──────────────────────────────────────
  const [pdfOutline, setPdfOutline] = useState<OutlineEntry[]>([]);
  const [pdfTotalPages, setPdfTotalPages] = useState<number | undefined>(undefined);
  const [pdfOutlineLoading, setPdfOutlineLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(meta.page ?? 1);
  // Bumped each time the user clicks "Jump to chunk" so the PdfViewer
  // remounts the iframe and re-runs the in-PDF text search even when
  // page + searchText are unchanged.
  const [jumpNonce, setJumpNonce] = useState(0);
  // Physical PDF page that actually contains the chunk text, resolved by
  // scanning the text layer. The chunk's stored `page_number` is the
  // PRINTED page, which is offset from the physical page by front matter —
  // trusting it directly lands the user in the wrong place.
  const [resolvedPage, setResolvedPage] = useState<number | null>(null);

  const audioSeekRef = useRef<((t: number) => void) | null>(null);

  // Locate the chunk's physical page on load (printed page as scan hint),
  // then jump there. This is what makes "open in viewer" land on the
  // right part of the book instead of page 1 / the printed-page guess.
  useEffect(() => {
    if (kind !== "pdf" || !meta.sourceUrl || !meta.chunkText) return;
    let cancelled = false;
    findPageWithText(meta.sourceUrl, meta.chunkText, meta.page ?? undefined)
      .then((p) => {
        if (cancelled || p == null) return;
        setResolvedPage(p);
        setCurrentPage(p);
        setJumpNonce((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, meta.sourceUrl, meta.chunkText, meta.page]);

  // Load PDF metadata on mount
  useEffect(() => {
    if (kind !== "pdf" || !meta.sourceUrl) return;
    setPdfOutlineLoading(true);
    let cancelled = false;

    extractPdfMetadata(meta.sourceUrl)
      .then((result) => {
        if (cancelled || !result) {
          setPdfOutlineLoading(false);
          return;
        }
        setPdfTotalPages(result.numPages);
        setPdfOutline(
          result.outline.map((e, i) => ({
            id: `pdf-${i}`,
            title: e.title,
            location: e.page,
            depth: e.depth,
            isChunkTarget: meta.page != null && e.page === meta.page,
          }))
        );
        setPdfOutlineLoading(false);
      })
      .catch(() => setPdfOutlineLoading(false));

    return () => {
      cancelled = true;
    };
  }, [kind, meta.sourceUrl, meta.page]);

  // Mark the active outline entry based on the current page
  const activePdfOutline = useMemo(() => {
    if (pdfOutline.length === 0) return pdfOutline;
    // Find the last entry whose page <= currentPage
    let activeIdx = -1;
    for (let i = 0; i < pdfOutline.length; i++) {
      if ((pdfOutline[i].location as number) <= currentPage) {
        activeIdx = i;
      }
    }
    return pdfOutline.map((e, i) => ({
      ...e,
      isActive: i === activeIdx,
    }));
  }, [pdfOutline, currentPage]);

  // ─── Rendering ──────────────────────────────────────────────

  if (!meta.sourceUrl) {
    // No original file to load. Research-agent citations (T4) carry no
    // source_url — the corpus tool server knows the work but the viewer
    // has no client-accessible file for it — yet the URL params still
    // hold the full citation payload (title, author, locator, quote), so
    // render a citation-details page instead of a dead "not found".
    if (meta.title || meta.chunkText) {
      return <CitationDetails meta={meta} />;
    }
    return <NotFound />;
  }

  // Derive a folder breadcrumb from the R2 URL. For audio chunks where
  // the filename is opaque ("HKEOMIX2834.flv") this is the only context
  // a human has to figure out what they're looking at. We also use the
  // last segment as a fallback title when the chunk has no parsed title.
  const pathTrail = parseSourcePathTrail(meta.sourceUrl);
  const filenameFromUrl = pathTrail[pathTrail.length - 1] ?? "";
  const displayTitle = meta.title || filenameFromUrl || t("viewer.title");

  const header = (
    <ViewerHeader
      title={displayTitle}
      author={meta.author}
      collection={meta.collection}
      section={meta.section}
      language={meta.language}
      sourceType={meta.sourceType}
      sourceUrl={meta.sourceUrl}
      pathTrail={pathTrail}
    />
  );

  const chunkPanel = (
    <ChunkPanel
      chunkText={meta.chunkText}
      section={meta.section}
      page={meta.page}
      timestampStart={meta.timestampStart}
      timestampEnd={meta.timestampEnd}
      language={meta.language}
      onJumpToChunk={() => {
        if (kind === "pdf") {
          const target = resolvedPage ?? meta.page;
          if (target != null) {
            setCurrentPage(target);
            setJumpNonce((n) => n + 1);
          } else if (meta.sourceUrl && meta.chunkText) {
            // Resolution hasn't landed yet (or found nothing) — scan the
            // PDF text layer now and jump to whatever page contains the
            // chunk snippet.
            findPageWithText(meta.sourceUrl, meta.chunkText)
              .then((p) => {
                if (p) {
                  setResolvedPage(p);
                  setCurrentPage(p);
                }
                setJumpNonce((n) => n + 1);
              })
              .catch(() => setJumpNonce((n) => n + 1));
          } else {
            setJumpNonce((n) => n + 1);
          }
        } else if (
          (kind === "audio" || kind === "video") &&
          meta.timestampStart != null &&
          audioSeekRef.current
        ) {
          audioSeekRef.current(meta.timestampStart);
        }
      }}
      onPlayChunk={
        (kind === "audio" || kind === "video") && meta.timestampStart != null
          ? () => audioSeekRef.current?.(meta.timestampStart!)
          : undefined
      }
    />
  );

  // ─── PDF variant with outline ───────────────────────────────
  if (kind === "pdf") {
    return (
      <ViewerLayout
        header={header}
        chunk={chunkPanel}
        outlineAvailable
        outline={
          <OutlinePanel
            variant="pdf"
            entries={activePdfOutline}
            loading={pdfOutlineLoading}
            onSelect={(entry) => {
              setCurrentPage(entry.location);
            }}
            emptyMessage="This PDF has no embedded table of contents."
          />
        }
      >
        <PdfViewer
          sourceUrl={meta.sourceUrl}
          page={currentPage}
          totalPages={pdfTotalPages}
          onPageChange={setCurrentPage}
          searchText={meta.chunkText}
          jumpNonce={jumpNonce}
        />
      </ViewerLayout>
    );
  }

  // ─── HTML text variant ──────────────────────────────────────
  if (kind === "html") {
    return (
      <ViewerLayout
        header={header}
        chunk={chunkPanel}
        outlineAvailable={false}
        outline={null}
      >
        <TextViewer
          sourceUrl={meta.sourceUrl}
          chunkText={meta.chunkText}
          charOffset={meta.charOffset}
          section={meta.section}
        />
      </ViewerLayout>
    );
  }

  // ─── Audio variant ──────────────────────────────────────────
  if (kind === "audio") {
    return (
      <ViewerLayout
        header={header}
        chunk={chunkPanel}
        outlineAvailable={false}
        outline={null}
      >
        <AudioViewer
          sourceUrl={meta.sourceUrl}
          chunkText={meta.chunkText}
          timestampStart={meta.timestampStart}
          timestampEnd={meta.timestampEnd}
          section={meta.section}
          onSeekReady={(fn) => (audioSeekRef.current = fn)}
        />
      </ViewerLayout>
    );
  }

  // ─── Video variant ──────────────────────────────────────────
  if (kind === "video") {
    return (
      <ViewerLayout
        header={header}
        chunk={chunkPanel}
        outlineAvailable={false}
        outline={null}
      >
        <VideoViewer
          sourceUrl={meta.sourceUrl}
          chunkText={meta.chunkText}
          timestampStart={meta.timestampStart}
          timestampEnd={meta.timestampEnd}
          section={meta.section}
        />
      </ViewerLayout>
    );
  }

  return <Unsupported />;
}

interface CitationMeta {
  docId: string;
  title: string;
  author: string | null;
  section: string | null;
  collection: string | null;
  language: string | null;
  page: number | null;
  timestampStart: number | null;
  passageStart: number | null;
  passageEnd: number | null;
  chunkText: string;
}

/**
 * Fallback view for citations without a loadable source file (research-
 * agent sources). Presents the work title, author, locator, and the
 * quoted passage — everything the citation carried — plus an honest note
 * that the full document isn't available in the viewer yet.
 */
function CitationDetails({ meta }: { meta: CitationMeta }) {
  const { locale } = useTranslation();
  const isArabic = detectArabicScript(meta.chunkText || meta.title);

  const locatorBits: string[] = [];
  if (meta.section) locatorBits.push(meta.section);
  else {
    if (meta.page != null) locatorBits.push(`s. ${meta.page}`);
    if (meta.passageStart != null) {
      locatorBits.push(
        meta.passageEnd != null && meta.passageEnd !== meta.passageStart
          ? `§${meta.passageStart}–${meta.passageEnd}`
          : `§${meta.passageStart}`
      );
    }
  }
  if (meta.timestampStart != null)
    locatorBits.push(formatTimestamp(meta.timestampStart));

  const note =
    locale === "tr"
      ? "Bu eserin tam metni henüz görüntüleyicide mevcut değil. Aşağıda alıntılanan bölüm gösteriliyor."
      : "The full document for this work isn't available in the viewer yet. The cited passage is shown below.";
  const quoteLabel = locale === "tr" ? "Alıntılanan bölüm" : "Cited passage";
  const backLabel = locale === "tr" ? "Aramaya dön" : "Back to search";

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="mx-auto max-w-[680px] px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        <div className="mt-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1
              className="text-xl font-semibold leading-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {cleanSourceTitle(meta.title) || meta.docId}
            </h1>
            {meta.author && (
              <p
                className="mt-0.5 text-sm text-muted-foreground"
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                {meta.author}
              </p>
            )}
            {(locatorBits.length > 0 || meta.collection) && (
              <p className="mt-1 text-[11px] uppercase tracking-[0.06em] text-muted-foreground/80">
                {[...locatorBits, meta.collection].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>

        {meta.chunkText && (
          <div className="mt-8">
            <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {quoteLabel}
            </div>
            <SourceContextPanel
              docId={meta.docId}
              chunkText={meta.chunkText}
              passageStart={meta.passageStart}
              className="max-h-[65vh] text-[15px]"
              placeholder={
                <>
                  <blockquote
                    dir={isArabic ? "rtl" : "ltr"}
                    className={cn(
                      "rounded-xl border border-border/60 bg-card/60 p-5 text-[15px] leading-relaxed text-foreground/85",
                      "border-l-4 border-l-primary/50",
                      isArabic && "font-[var(--font-arabic)] text-base"
                    )}
                  >
                    {meta.chunkText}
                  </blockquote>
                  <p className="mt-4 text-xs text-muted-foreground">{note}</p>
                </>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-8">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <FileQuestion className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2
          className="text-h2-serif text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("viewer.notFound")}
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {t("viewer.notFoundDesc")}
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("viewer.backToSearch")}
        </Link>
      </div>
    </div>
  );
}

function Unsupported() {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-8">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <FileQuestion className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-h2-serif text-foreground">{t("viewer.unsupported")}</h2>
      </div>
    </div>
  );
}
