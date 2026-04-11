import React from "react";
import { BookOpen, Clock, FileText, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { cn, detectArabicScript, formatTimestamp } from "@/lib/utils";
import { LanguageBadge } from "@/components/shared/LanguageBadge";
import { SourceBadge } from "@/components/shared/SourceBadge";
import { FeedbackWidget } from "@/components/shared/FeedbackWidget";
import { CitationChip } from "@/components/ornaments/CitationChip";
import type { SearchResult } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { buildSourceViewerUrl } from "@/lib/source-viewer";
import { buildSnippet } from "@/lib/snippet";

/**
 * Tiny **bold** Markdown renderer for the LLM-highlighted snippet.
 * The highlight pass only emits **bold** spans so we don't need a full
 * markdown parser — splitting on `**…**` pairs is sufficient. Falls
 * through to plain text if no markers are found.
 */
function renderHighlightedMarkdown(text: string): React.ReactNode[] {
  // Split on bold markers, capturing them so we can tell which segments
  // were inside `**…**`. Pairs of `**` open + `**` close → odd indices
  // are the bolded content.
  const parts = text.split(/\*\*([^*]+?)\*\*/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <strong
          key={i}
          className="rounded-sm bg-primary/20 px-0.5 font-semibold text-foreground"
        >
          {part}
        </strong>
      );
    }
    return part ? <span key={i}>{part}</span> : null;
  });
}

interface ResultCardProps {
  result: SearchResult;
  index: number;
  query?: string;
  /** All AI-expanded query phrasings the parent search ran. Forwarded
   *  to FeedbackWidget so a thumbs-up/down call can capture training
   *  context. */
  expandedQueries?: string[];
  /** Filter context the user had set when this card was rendered. */
  filterLanguage?: string;
  filterCategory?: string;
  selected?: boolean;
  onSelect?: () => void;
}

export function ResultCard({
  result,
  index,
  query,
  expandedQueries,
  filterLanguage,
  filterCategory,
  selected,
  onSelect,
}: ResultCardProps) {
  const { t } = useTranslation();
  const { chunk, score, rerank_score } = result;
  const isArabic = detectArabicScript(chunk.text);
  const displayScore = rerank_score ?? score;
  const viewerUrl = buildSourceViewerUrl(chunk);
  // Prefer the LLM-bolded version when the Convex highlight pass populated
  // it. We render that as Markdown so the **bold** spans show up.
  // Otherwise fall back to the query-aware snippet helper.
  const snippet = buildSnippet(chunk.text, query, 600);
  const highlighted = chunk.highlighted_text;

  const openViewer = (e: React.MouseEvent) => {
    // Don't open when clicking on feedback buttons or other interactive children
    const target = e.target as HTMLElement;
    if (target.closest("button, a")) return;
    if (onSelect) {
      onSelect();
      return;
    }
    window.open(viewerUrl, "_blank", "noopener");
  };

  // Confidence dots: 4 dots, filled by score buckets
  const filledDots = Math.max(1, Math.min(4, Math.ceil(displayScore * 4)));

  return (
    <motion.article
      id={`result-${index}`}
      // Direct initial/animate (NOT variants) so every newly-mounted
      // card runs its own enter animation, independent of any parent.
      // The streaming search adds cards in waves and the variants-based
      // approach inherited the parent's already-completed "show" state,
      // making new cards pop in invisibly.
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      onClick={openViewer}
      whileHover={{ y: -1 }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-2xl border bg-card p-5",
        "transition-all duration-200",
        selected
          ? "border-primary/60 shadow-[var(--shadow-md)] ring-1 ring-primary/30"
          : "border-border hover:border-primary/30 hover:shadow-[var(--shadow-md)]"
      )}
    >
      {/* Header */}
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <CitationChip number={index + 1} className="pointer-events-none" />
          <a
            href={viewerUrl}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="truncate text-foreground no-underline hover:text-primary transition-colors"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.0625rem",
              fontWeight: 600,
              letterSpacing: "-0.005em",
            }}
          >
            {chunk.title || t("result.untitled")}
          </a>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <LanguageBadge language={chunk.language} />
          <SourceBadge sourceType={chunk.source_type} />
        </div>
      </div>

      {/* Author & Collection */}
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        {chunk.author_speaker && (
          <span
            className="flex items-center gap-1"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            <BookOpen className="h-3 w-3" />
            {chunk.author_speaker}
          </span>
        )}
        {chunk.collection && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
            {chunk.collection}
          </span>
        )}
        {chunk.chapter_section && (
          <span className="truncate">{chunk.chapter_section}</span>
        )}
      </div>

      {/* Snippet body. When the Convex highlight pass left us a
          `highlighted_text` with **bold** markdown, render that as
          markdown so the LLM-picked spans show up. Otherwise fall back
          to the query-token-aware <mark> highlighter.

          Both paths use a 5-line `-webkit-line-clamp` so cards stay
          visually consistent regardless of how long the chunk is. The
          full passage is always one click away in the source viewer. */}
      <div
        dir={isArabic ? "rtl" : "ltr"}
        className={cn(
          "overflow-hidden text-[15px] leading-relaxed text-card-foreground/80",
          isArabic && "font-[var(--font-arabic)] text-base",
        )}
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 5,
          WebkitBoxOrient: "vertical",
        }}
      >
        {highlighted
          ? renderHighlightedMarkdown(highlighted)
          : snippet.map((seg, i) =>
              seg.kind === "match" ? (
                <mark
                  key={i}
                  className="rounded-sm bg-primary/20 px-0.5 text-foreground"
                >
                  {seg.value}
                </mark>
              ) : (
                <span key={i}>{seg.value}</span>
              ),
            )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {chunk.page_number != null && (
            <span className="flex items-center gap-1 font-mono">
              <FileText className="h-3 w-3" />
              {t("result.page")} {chunk.page_number}
            </span>
          )}
          {chunk.timestamp_start != null && (
            <span className="flex items-center gap-1 font-mono">
              <Clock className="h-3 w-3" />
              {formatTimestamp(chunk.timestamp_start)}
              {chunk.timestamp_end != null &&
                ` – ${formatTimestamp(chunk.timestamp_end)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <FeedbackWidget
            targetId={chunk.chunk_id}
            context="search_result"
            query={query}
            matchedQuery={chunk.matched_query ?? undefined}
            expandedQueries={expandedQueries}
            filterLanguage={filterLanguage}
            filterCategory={filterCategory}
            chunkSnapshot={{
              chunk_id: chunk.chunk_id,
              doc_id: chunk.doc_id,
              title: chunk.title || undefined,
              author_speaker: chunk.author_speaker || undefined,
              collection: chunk.collection || undefined,
              text_excerpt: (chunk.text ?? "").slice(0, 400),
              page_number: chunk.page_number ?? undefined,
              score,
              rerank_score: rerank_score ?? undefined,
              language: chunk.language,
            }}
            compact
          />
          <div
            className="flex items-center gap-1"
            title={`${(displayScore * 100).toFixed(0)}% relevance`}
            aria-label={`Relevance ${filledDots} of 4`}
          >
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  i < filledDots ? "bg-primary" : "bg-primary/15"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
