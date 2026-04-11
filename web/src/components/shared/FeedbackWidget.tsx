import { useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, Send, X, Check } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { cn } from "@/lib/utils";
import { trackFeedback } from "@/lib/analytics";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { BACKEND_ENABLED } from "@/lib/env";
import { captureError } from "@/lib/observability";

type Rating = "up" | "down" | null;
type FeedbackContext = "search_result" | "ai_answer" | "chat_message";

/**
 * Optional snapshot of the chunk being rated. Captured at click time
 * and persisted alongside the rating so analysis later doesn't have
 * to join against the (mutable) Qdrant index.
 */
interface ChunkSnapshot {
  chunk_id: string;
  doc_id?: string;
  title?: string;
  author_speaker?: string;
  collection?: string;
  text_excerpt?: string;
  page_number?: number;
  score?: number;
  rerank_score?: number;
  language?: string;
}

interface FeedbackWidgetProps {
  targetId: string;
  context: FeedbackContext;
  query?: string;
  model?: string;
  /** Which AI-expanded phrasing actually retrieved this result. */
  matchedQuery?: string;
  /** All AI-expanded phrasings the search ran. */
  expandedQueries?: string[];
  /** Frozen chunk metadata for downstream training. */
  chunkSnapshot?: ChunkSnapshot;
  /** Filter context the user had set. */
  filterLanguage?: string;
  filterCategory?: string;
  /** Compact mode for inline use in result cards */
  compact?: boolean;
  onSubmit?: (rating: "up" | "down", comment?: string) => void;
}

export function FeedbackWidget({
  targetId,
  context,
  query,
  model,
  matchedQuery,
  expandedQueries,
  chunkSnapshot,
  filterLanguage,
  filterCategory,
  compact = false,
  onSubmit,
}: FeedbackWidgetProps) {
  const { t } = useTranslation();
  const submitRating = useMutation(api.mutations.feedback.submitRating);
  const submitComment = useMutation(api.mutations.feedback.submitComment);
  const [rating, setRating] = useState<Rating>(null);
  const [feedbackId, setFeedbackId] = useState<Id<"feedback"> | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const persistRating = async (r: "up" | "down") => {
    if (!BACKEND_ENABLED) return;
    try {
      const id = await submitRating({
        targetType: context,
        targetId,
        rating: r,
        query,
        model,
        matchedQuery,
        expandedQueries,
        chunkSnapshot,
        filterLanguage,
        filterCategory,
      });
      setFeedbackId(id as Id<"feedback">);
    } catch (err) {
      captureError(err, { where: "feedback.submitRating", context });
    }
  };

  const handleRate = (newRating: "up" | "down") => {
    const finalRating = rating === newRating ? null : newRating;
    setRating(finalRating);

    if (finalRating) {
      trackFeedback(
        finalRating === "up" ? "thumbs_up" : "thumbs_down",
        context,
        targetId
      );
      void persistRating(finalRating);
      onSubmit?.(finalRating);

      // Show comment prompt on thumbs down
      if (finalRating === "down") {
        setShowComment(true);
      }
    }
  };

  const handleSubmitComment = () => {
    if (!comment.trim() || !rating) return;
    if (BACKEND_ENABLED && feedbackId) {
      submitComment({ feedbackId, comment: comment.trim() }).catch((err) =>
        captureError(err, { where: "feedback.submitComment" })
      );
    }
    onSubmit?.(rating, comment.trim());
    setSubmitted(true);
    setShowComment(false);
    setTimeout(() => setSubmitted(false), 3000);
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-0.5">
        <button
          onClick={() => handleRate("up")}
          className={cn(
            "rounded p-1 transition-colors",
            rating === "up"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground/50 hover:text-primary hover:bg-primary/5"
          )}
          title={t("result.helpful")}
        >
          <ThumbsUp className="h-3 w-3" />
        </button>
        <button
          onClick={() => handleRate("down")}
          className={cn(
            "rounded p-1 transition-colors",
            rating === "down"
              ? "bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-300"
              : "text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
          )}
          title={t("result.notHelpful")}
        >
          <ThumbsDown className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Rating buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">{t("search.feedbackQuestion")}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleRate("up")}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
              rating === "up"
                ? "bg-primary/15 text-primary border border-primary/30"
                : "border border-transparent text-muted-foreground hover:text-primary hover:bg-primary/5"
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            {t("search.feedbackYes")}
          </button>
          <button
            onClick={() => handleRate("down")}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
              rating === "down"
                ? "bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
                : "border border-transparent text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            )}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            {t("search.feedbackNo")}
          </button>

          {rating && !showComment && !submitted && (
            <button
              onClick={() => setShowComment(true)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t("search.feedbackComment")}
            </button>
          )}

          {submitted && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Check className="h-3.5 w-3.5" />
              {t("search.feedbackThanks")}
            </span>
          )}
        </div>
      </div>

      {/* Comment form */}
      {showComment && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 animate-in slide-in-from-top-1">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("search.commentPlaceholder")}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50"
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={handleSubmitComment}
              disabled={!comment.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setShowComment(false); setComment(""); }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
