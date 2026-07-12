import { cn, detectArabicScript, truncate } from "@/lib/utils";
import {
  cleanSourceTitle,
  formatSourceLocator,
} from "@/lib/citations";
import type { ChunkResult } from "@/lib/types";

/**
 * Rich hover/popover content for a citation chip — shared by the search
 * AIAnswer and chat MessageBubble.
 *
 * Shows the (cleaned) work title, author, a locator line (page range /
 * passage range / timestamp — research-format aware), and the quoted
 * passage, RTL-aware. For research-agent sources (T4) this popover is the
 * primary citation surface: those sources carry no source_url, so the
 * viewer can only show this same metadata (see /source/:docId fallback).
 */
export function CitationSourceTooltip({ source }: { source: ChunkResult }) {
  const isArabic = detectArabicScript(source.text);
  const meta: string[] = [];
  if (source.author_speaker) meta.push(source.author_speaker);
  meta.push(...formatSourceLocator(source));
  return (
    <div className="w-[300px] p-3">
      <p
        className="text-[13px] font-semibold text-foreground leading-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {cleanSourceTitle(source.title)}
      </p>
      {meta.length > 0 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {meta.join(" · ")}
        </p>
      )}
      {source.text && (
        <p
          dir={isArabic ? "rtl" : "ltr"}
          className={cn(
            "mt-2 text-[11px] leading-snug text-foreground/75 line-clamp-4",
            isArabic && "font-[var(--font-arabic)] text-[13px]",
          )}
        >
          {truncate(source.text, 220)}
        </p>
      )}
    </div>
  );
}
