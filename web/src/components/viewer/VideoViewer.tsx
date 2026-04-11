import { useRef, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { cn, detectArabicScript, formatTimestamp } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface VideoViewerProps {
  sourceUrl: string;
  chunkText: string;
  timestampStart: number | null;
  timestampEnd: number | null;
  section?: string | null;
}

/**
 * HTML5 video player with auto-seek to chunk timestamp.
 * Uses the `#t=` media fragment URI when possible, falling back to
 * JS seek after loadedmetadata.
 */
export function VideoViewer({
  sourceUrl,
  chunkText,
  timestampStart,
  timestampEnd,
  section,
}: VideoViewerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadError, setLoadError] = useState(false);
  const isArabic = detectArabicScript(chunkText);

  const videoSrc =
    timestampStart != null ? `${sourceUrl}#t=${timestampStart}` : sourceUrl;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoadedMeta = () => {
      if (timestampStart != null && video.currentTime < timestampStart) {
        video.currentTime = timestampStart;
      }
    };
    const onError = () => setLoadError(true);
    video.addEventListener("loadedmetadata", onLoadedMeta);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMeta);
      video.removeEventListener("error", onError);
    };
  }, [timestampStart]);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      {loadError && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t("viewer.demoNotice")}
          </p>
        </div>
      )}

      {/* Video player */}
      <div className="mx-auto w-full max-w-4xl p-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-lg">
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            className="aspect-video w-full"
          />
        </div>

        {section && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {section}
          </p>
        )}

        {/* Highlighted chunk */}
        <div className="mt-4 rounded-2xl border border-primary/20 bg-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-primary">
              {t("viewer.highlightedPassage")}
            </p>
            {timestampStart != null && timestampEnd != null && (
              <span className="text-[11px] font-mono text-muted-foreground">
                {formatTimestamp(timestampStart)} – {formatTimestamp(timestampEnd)}
              </span>
            )}
          </div>
          <p
            dir={isArabic ? "rtl" : "ltr"}
            className={cn(
              "text-sm leading-relaxed text-foreground",
              isArabic && "font-[var(--font-arabic)] text-base"
            )}
          >
            <mark className="bg-yellow-200 dark:bg-yellow-500/30 px-0.5 rounded">
              {chunkText}
            </mark>
          </p>
        </div>
      </div>
    </div>
  );
}
