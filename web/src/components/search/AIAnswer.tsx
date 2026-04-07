import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedbackWidget } from "@/components/shared/FeedbackWidget";
import type { SearchResult } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface AIAnswerProps {
  answer: string;
  sources: SearchResult[];
  isStreaming?: boolean;
}

export function AIAnswer({ answer, sources, isStreaming = false }: AIAnswerProps) {
  const { t } = useTranslation();
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  const renderContent = (text: string) => {
    // Replace [N] citation markers with styled spans
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const num = parseInt(match[1]);
        return (
          <button
            key={i}
            onClick={() => {
              document.getElementById(`result-${num - 1}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary hover:bg-primary/25 transition-colors mx-0.5 align-super"
            title={sources[num - 1]?.chunk.title}
          >
            {num}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-semibold text-primary">{t("search.aiAnswerTitle")}</span>
        {isStreaming && (
          <span className="text-xs text-muted-foreground animate-pulse">Yanıt oluşturuluyor...</span>
        )}
      </div>

      {/* Answer content */}
      <div className={cn("prose prose-sm max-w-none text-foreground/90 leading-relaxed", isStreaming && "streaming-cursor")}>
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <p className="mb-3 last:mb-0">
                {typeof children === "string" ? renderContent(children) : children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
          }}
        >
          {answer}
        </ReactMarkdown>
      </div>

      {/* Feedback */}
      {!isStreaming && (
        <div className="mt-4 border-t border-border/30 pt-3">
          <FeedbackWidget
            targetId={`ai-answer-${sources[0]?.chunk.chunk_id ?? "none"}`}
            context="ai_answer"
          />
        </div>
      )}

      {/* Sources section */}
      {sources.length > 0 && (
        <div className="mt-5 border-t border-border/50 pt-4">
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {sources.length} {t("search.sourcesUsed")}
            {sourcesExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {sourcesExpanded && (
            <div className="mt-3 grid gap-2">
              {sources.map((s, i) => (
                <div
                  key={s.chunk.chunk_id}
                  className="flex items-start gap-2 rounded-lg bg-card/80 p-2.5 text-xs"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{s.chunk.title}</span>
                    {s.chunk.author_speaker && (
                      <span className="text-muted-foreground"> — {s.chunk.author_speaker}</span>
                    )}
                    {s.chunk.page_number != null && (
                      <span className="text-muted-foreground"> (s. {s.chunk.page_number})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
