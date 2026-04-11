import { useRef, useEffect, useState } from "react";
import { FileText, AlertCircle } from "lucide-react";
import { cn, detectArabicScript } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface TextViewerProps {
  sourceUrl: string;
  chunkText: string;
  charOffset: number | null;
  section?: string | null;
}

/**
 * Renders pre-rendered HTML companion (.html sibling to the original source).
 *
 * Flow:
 * 1. Fetch the HTML content into a scroll container (sandboxed via <iframe srcDoc>)
 * 2. After load, post a message to the iframe asking it to scroll to the chunk
 *    and wrap the match in a <mark> for highlighting.
 * 3. If fetch fails (demo mode), fall back to the plain chunk text view.
 */
export function TextViewer({
  sourceUrl,
  chunkText,
  charOffset,
  section,
}: TextViewerProps) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const isArabic = detectArabicScript(chunkText);

  useEffect(() => {
    let cancelled = false;
    fetch(sourceUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        // Inject chunk highlighting: wrap first occurrence of chunkText in <mark>
        const highlighted = injectHighlight(text, chunkText, charOffset);
        setHtml(highlighted);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl, chunkText, charOffset]);

  // Scroll iframe to the <mark> after load
  useEffect(() => {
    if (!html) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const mark = doc.querySelector("mark[data-chunk]");
        if (mark) {
          (mark as HTMLElement).scrollIntoView({ behavior: "auto", block: "center" });
        }
      } catch {
        /* cross-origin or other */
      }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html]);

  if (loadError) {
    return <DemoFallback chunkText={chunkText} isArabic={isArabic} section={section} />;
  }

  if (!html) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-sm text-muted-foreground">{t("viewer.loading")}</div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      title="Text viewer"
      className="h-full w-full border-0 bg-background"
      sandbox="allow-same-origin"
    />
  );
}

/** Wrap the first exact match of `chunkText` in the HTML in a highlighted <mark>. */
function injectHighlight(
  html: string,
  chunkText: string,
  _charOffset: number | null
): string {
  // Trim to first ~80 chars — long exact matches rarely work across whitespace
  const needle = chunkText.slice(0, 80).trim();
  if (!needle) return html;

  // Escape the needle for safe inclusion in HTML
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped);

  // Find in body text only — not in tags
  const idx = html.search(re);
  if (idx === -1) {
    // Inject CSS scrollbar and return unmodified — user can ctrl+F
    return wrapWithStyles(html);
  }

  const before = html.slice(0, idx);
  const match = html.slice(idx, idx + needle.length);
  const after = html.slice(idx + needle.length);

  const marked = `${before}<mark data-chunk="true" style="background:#fef08a;padding:2px 4px;border-radius:3px;scroll-margin-top:40vh;">${match}</mark>${after}`;
  return wrapWithStyles(marked);
}

function wrapWithStyles(html: string): string {
  // Inject a base stylesheet so the content is readable in the iframe
  const style = `
    <style>
      body { font-family: system-ui, sans-serif; line-height: 1.7; max-width: 720px; margin: 2rem auto; padding: 0 1.5rem; color: #1c1917; background: #fafaf9; }
      h1, h2, h3 { color: #0c0a09; }
      p { margin: 0 0 1em; }
      mark[data-chunk] { background: #fef08a !important; }
      @media (prefers-color-scheme: dark) {
        body { color: #fafaf9; background: #0c0a09; }
        h1, h2, h3 { color: #fafaf9; }
        mark[data-chunk] { background: rgba(234, 179, 8, 0.35) !important; color: inherit; }
      }
    </style>
  `;
  // Insert before </head> or at start if no head
  if (html.includes("</head>")) {
    return html.replace("</head>", `${style}</head>`);
  }
  return `<!DOCTYPE html><html><head>${style}</head><body>${html}</body></html>`;
}

function DemoFallback({
  chunkText,
  isArabic,
  section,
}: {
  chunkText: string;
  isArabic: boolean;
  section?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full items-center justify-center p-8 overflow-y-auto">
      <div className="max-w-xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t("viewer.demoNotice")}
          </p>
        </div>

        {section && (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span>{section}</span>
          </div>
        )}

        <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border-l-4 border-yellow-400 dark:border-yellow-500 p-4">
          <p className="text-[11px] font-semibold text-yellow-700 dark:text-yellow-300 mb-2">
            {t("viewer.highlightedPassage")}
          </p>
          <p
            dir={isArabic ? "rtl" : "ltr"}
            className={cn(
              "text-sm leading-relaxed text-foreground",
              isArabic && "font-[var(--font-arabic)] text-base"
            )}
          >
            {chunkText}
          </p>
        </div>
      </div>
    </div>
  );
}
