import { Bookmark, ThumbsUp, ThumbsDown, Play } from "lucide-react";
import { cn, detectArabicScript, formatTimestamp } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface ChunkPanelProps {
  chunkText: string;
  section?: string | null;
  page?: number | null;
  timestampStart?: number | null;
  timestampEnd?: number | null;
  language?: string | null;
  /** Called when the user clicks "Open in document" — scrolls/seeks main pane. */
  onJumpToChunk?: () => void;
  /** For audio/video: called when user clicks "Play chunk" */
  onPlayChunk?: () => void;
}

/**
 * The right-side panel in the source viewer. Shows the exact passage
 * that was cited with a scholarly gilt-rule quote block, plus actions
 * to jump to it in the main document and give feedback.
 */
export function ChunkPanel({
  chunkText,
  section,
  page,
  timestampStart,
  timestampEnd,
  language,
  onJumpToChunk,
  onPlayChunk,
}: ChunkPanelProps) {
  const { t } = useTranslation();
  const isArabic = detectArabicScript(chunkText) || language === "ar";

  const locationLabel = page != null
    ? `${t("viewer.page")} ${page}`
    : timestampStart != null
      ? `${formatTimestamp(timestampStart)}${timestampEnd != null ? ` – ${formatTimestamp(timestampEnd)}` : ""}`
      : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-card px-5 py-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Bookmark className="h-3 w-3" />
          {t("viewer.highlightedPassage")}
        </div>
        {(locationLabel || section) && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {locationLabel && (
              <span className="font-mono">{locationLabel}</span>
            )}
            {locationLabel && section && <span>›</span>}
            {section && <span className="truncate">{section}</span>}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* Scholarly quote block with gilt rule */}
        <blockquote
          className={cn(
            "border-l-[3px] pl-4 py-1",
            "text-foreground/90"
          )}
          style={{
            borderColor: "var(--color-gilt)",
            fontFamily: isArabic ? "var(--font-arabic)" : "var(--font-display)",
            fontSize: isArabic ? "1.125rem" : "1.0625rem",
            lineHeight: 1.65,
            fontWeight: isArabic ? 400 : 500,
          }}
          dir={isArabic ? "rtl" : "ltr"}
        >
          {chunkText}
        </blockquote>

        {/* Actions */}
        <div className="mt-5 space-y-2">
          {onPlayChunk && timestampStart != null && (
            <button
              onClick={onPlayChunk}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 active:scale-[0.98]"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {t("viewer.playFromHere")}
            </button>
          )}
          {onJumpToChunk && (
            <button
              onClick={onJumpToChunk}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.98]"
            >
              {t("viewer.jumpToChunk")}
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="my-6 h-px bg-border" />

        {/* Feedback */}
        <div>
          <p
            className="mb-2 text-[11px] text-muted-foreground"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            Was this the right passage?
          </p>
          <div className="flex items-center gap-1.5">
            <button
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:border-primary/30 hover:text-primary"
              aria-label="Yes"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              Yes
            </button>
            <button
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/5 hover:border-destructive/30 hover:text-destructive"
              aria-label="No"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              No
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
