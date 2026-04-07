import { BookOpen, Clock, FileText } from "lucide-react";
import { cn, detectArabicScript, formatTimestamp, truncate } from "@/lib/utils";
import { LanguageBadge } from "@/components/shared/LanguageBadge";
import { SourceBadge } from "@/components/shared/SourceBadge";
import { FeedbackWidget } from "@/components/shared/FeedbackWidget";
import type { SearchResult } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface ResultCardProps {
  result: SearchResult;
  index: number;
}

export function ResultCard({ result, index }: ResultCardProps) {
  const { t } = useTranslation();
  const { chunk, score, rerank_score } = result;
  const isArabic = detectArabicScript(chunk.text);
  const displayScore = rerank_score ?? score;

  return (
    <div
      id={`result-${index}`}
      className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <h3 className="truncate text-sm font-semibold text-foreground">
            {chunk.title || t("result.untitled")}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <LanguageBadge language={chunk.language} />
          <SourceBadge sourceType={chunk.source_type} />
        </div>
      </div>

      {/* Author & Collection */}
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        {chunk.author_speaker && (
          <span className="flex items-center gap-1">
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

      {/* Text snippet */}
      <p
        dir={isArabic ? "rtl" : "ltr"}
        className={cn(
          "text-sm leading-relaxed text-card-foreground/80",
          isArabic && "font-[var(--font-arabic)] text-base"
        )}
      >
        {truncate(chunk.text, 280)}
      </p>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {chunk.page_number != null && (
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {t("result.page")} {chunk.page_number}
            </span>
          )}
          {chunk.timestamp_start != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimestamp(chunk.timestamp_start)}
              {chunk.timestamp_end != null && ` – ${formatTimestamp(chunk.timestamp_end)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <FeedbackWidget targetId={chunk.chunk_id} context="search_result" compact />
          <div className="flex items-center gap-1">
            <div
              className="h-1.5 rounded-full bg-primary/20"
              style={{ width: `${Math.max(20, displayScore * 60)}px` }}
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${displayScore * 100}%` }}
              />
            </div>
            <span className="text-[10px]">{(displayScore * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
