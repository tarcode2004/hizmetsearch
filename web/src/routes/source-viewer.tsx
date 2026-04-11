import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { FileQuestion, ArrowLeft } from "lucide-react";
import { getViewerKind, parseSourcePathTrail } from "@/lib/source-viewer";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { ViewerHeader } from "@/components/viewer/ViewerHeader";
import { PdfViewer, extractPdfMetadata, findPageWithText } from "@/components/viewer/PdfViewer";
import { TextViewer } from "@/components/viewer/TextViewer";
import { AudioViewer } from "@/components/viewer/AudioViewer";
import { VideoViewer } from "@/components/viewer/VideoViewer";
import { ViewerLayout } from "@/components/viewer/ViewerLayout";
import { OutlinePanel, type OutlineEntry } from "@/components/viewer/OutlinePanel";
import { ChunkPanel } from "@/components/viewer/ChunkPanel";

/**
 * Standalone source viewer route. Opens in a new tab when a user clicks
 * a source card or citation. All context comes from URL query params,
 * so the page is fully shareable.
 */
export function SourceViewerPage() {
  const { t } = useTranslation();
  const { docId } = useParams<{ docId: string }>();
  const [params] = useSearchParams();

  const meta = useMemo(
    () => ({
      docId: docId ?? "",
      chunkId: params.get("chunk") ?? "",
      sourceUrl: params.get("src"),
      sourceExt: params.get("ext"),
      sourceType: params.get("type"),
      page: params.get("page") ? Number(params.get("page")) : null,
      timestampStart: params.get("ts") ? Number(params.get("ts")) : null,
      timestampEnd: params.get("te") ? Number(params.get("te")) : null,
      charOffset: params.get("off") ? Number(params.get("off")) : null,
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

  const audioSeekRef = useRef<((t: number) => void) | null>(null);

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
          console.log("[jump] click", {
            page: meta.page,
            hasUrl: !!meta.sourceUrl,
            chunkTextLen: meta.chunkText?.length ?? 0,
            currentPage,
          });
          if (meta.page != null) {
            // Stored page number on the chunk — trust it.
            setCurrentPage(meta.page);
            setJumpNonce((n) => n + 1);
          } else if (meta.sourceUrl && meta.chunkText) {
            // No page on the chunk — scan the PDF text via pdf.js to
            // locate the page that contains the snippet, then jump.
            findPageWithText(meta.sourceUrl, meta.chunkText)
              .then((p) => {
                console.log("[jump] findPageWithText resolved", { foundPage: p });
                if (p) setCurrentPage(p);
                setJumpNonce((n) => n + 1);
              })
              .catch((e) => {
                console.warn("[jump] findPageWithText threw", e);
                setJumpNonce((n) => n + 1);
              });
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
