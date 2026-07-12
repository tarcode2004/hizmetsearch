import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  BookOpen,
  ExternalLink,
  ArrowUpRight,
  MessageSquarePlus,
} from "lucide-react";
import { api } from "@convex/api";
import { cn, truncate } from "@/lib/utils";
import { FeedbackWidget } from "@/components/shared/FeedbackWidget";
import { CitationChip } from "@/components/ornaments/CitationChip";
import { CitationSourceTooltip } from "@/components/ornaments/CitationSourceTooltip";
import type { AIModel, SearchResult } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { buildSourceViewerUrl } from "@/lib/source-viewer";
import {
  cleanSourceTitle,
  formatSourceLocator,
  preprocessCitations,
  renderCitedChildren,
  withCitationFallthrough,
} from "@/lib/citations";
import { captureError } from "@/lib/observability";
import { fade, spring } from "@/lib/motion";

interface AIAnswerProps {
  answer: string;
  sources: SearchResult[];
  isStreaming?: boolean;
  /** The original search query that produced this answer. Used by the
   *  "Keep chatting" button to seed a new chat conversation as the
   *  first user turn. */
  query?: string;
  /** Which model family the AI Answer was synthesized with. Carried
   *  onto the seeded chat conversation so the chat continues with the
   *  same model by default. Defaults to "gemini" — the search action
   *  always uses Gemini for the AI Answer pass. */
  model?: AIModel;
}

// A handful of common related-topic follow-ups — stubbed client-side
// until the backend generates real follow-ups.
const FOLLOWUP_SUGGESTIONS = [
  "Related theme across Risale-i Nur",
  "How does Bediüzzaman frame this?",
  "What do other scholars say?",
];

export function AIAnswer({
  answer,
  sources,
  isStreaming = false,
  query,
  model = "gemini",
}: AIAnswerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const createConversationFromSearch = useMutation(
    api.mutations.conversations.createFromSearch,
  );
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  const handleKeepChatting = async () => {
    if (!query || !answer || isCreatingConversation) return;
    setIsCreatingConversation(true);
    try {
      // Strip the SearchResult shape down to what the messages.sources
      // schema accepts. The frontend ChunkResult has extra fields
      // (source_url, source_ext, char_offset, highlighted_text,
      // matched_query) that the schema validator would reject. Also
      // collapse `null` to `undefined` on optional fields.
      const trimmedSources = sources.map((s) => ({
        chunk_id: s.chunk.chunk_id,
        doc_id: s.chunk.doc_id,
        text: s.chunk.text,
        parent_text: s.chunk.parent_text ?? undefined,
        source_type: s.chunk.source_type,
        language: s.chunk.language,
        collection: s.chunk.collection,
        title: s.chunk.title,
        author_speaker: s.chunk.author_speaker,
        publisher: s.chunk.publisher,
        chapter_section: s.chunk.chapter_section,
        page_number: s.chunk.page_number ?? undefined,
        timestamp_start: s.chunk.timestamp_start ?? undefined,
        timestamp_end: s.chunk.timestamp_end ?? undefined,
        score: s.score ?? undefined,
      }));
      const conversationId = await createConversationFromSearch({
        query,
        aiAnswer: answer,
        sources: trimmedSources,
        model,
      });
      navigate(`/chat/${conversationId}`);
    } catch (err) {
      console.error("createFromSearch failed", err);
      captureError(err, { where: "AIAnswer.keepChatting", query });
      toast.error(
        err instanceof Error ? err.message : "Couldn't open chat. Try again.",
      );
      setIsCreatingConversation(false);
    }
  };

  // Build a chip for one citation number.
  const makeChip = (num: number, key: string) => {
    const source = sources[num - 1];
    const href = source ? buildSourceViewerUrl(source.chunk) : "#";
    return (
      <CitationChip
        key={key}
        number={num}
        href={href}
        tooltip={source ? <CitationSourceTooltip source={source.chunk} /> : undefined}
        target="_blank"
        rel="noopener"
        onClick={(e) => {
          if (e.shiftKey) {
            e.preventDefault();
            document
              .getElementById(`result-${num - 1}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }}
      />
    );
  };

  // Recursively walk a React children tree and swap citation
  // placeholders for chips — shared walker in @/lib/citations (handles
  // strings, arrays, and arbitrary inline-element nesting; the
  // fallthrough map below covers node types without a styled handler,
  // which is what used to leak NOGLYPH tofu).
  const renderChildren = (
    children: React.ReactNode,
    baseKey: string,
  ): React.ReactNode => renderCitedChildren(children, makeChip, baseKey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/5 via-background to-background p-6 sm:p-8 shadow-[var(--shadow-sm)]"
    >
      {/* Decorative corner ornament */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />

      {/* Header */}
      <div className="relative mb-5 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 shadow-[inset_0_0_0_1px_var(--color-primary-soft)]">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <span
          className="text-sm font-semibold text-primary"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            letterSpacing: "0.01em",
          }}
        >
          {t("search.aiAnswerTitle")}
        </span>
        {isStreaming && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Generating…
          </span>
        )}
      </div>

      {/* Answer content */}
      <div
        className={cn(
          "relative max-w-none leading-relaxed text-foreground/90",
          isStreaming && "streaming-cursor"
        )}
        style={{
          fontSize: "1.0625rem",
          lineHeight: 1.65,
        }}
      >
        <ReactMarkdown
          components={withCitationFallthrough({
            p: ({ children, node }) => {
              // Drop cap the first paragraph only
              const isFirst =
                node && node.position?.start?.line === 1;
              return (
                <p className={cn("mb-4 last:mb-0", isFirst && "drop-cap")}>
                  {renderChildren(children, "p")}
                </p>
              );
            },
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">
                {renderChildren(children, "s")}
              </strong>
            ),
            em: ({ children }) => (
              <em style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
                {renderChildren(children, "e")}
              </em>
            ),
            // Lists — the AI Answer often enumerates findings ("vasıflar")
            // as a bulleted or numbered list. Without an explicit `li`
            // handler ReactMarkdown renders the default <li> and the
            // citation placeholders inside it never get swapped for chips,
            // leaving raw private-use Unicode that renders as NOGLYPH tofu.
            ul: ({ children }) => (
              <ul className="mb-4 ml-5 list-disc space-y-1 last:mb-0 marker:text-muted-foreground/60">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-4 ml-5 list-decimal space-y-1 last:mb-0 marker:text-muted-foreground/60">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">{renderChildren(children, "li")}</li>
            ),
            h1: ({ children }) => (
              <h1
                className="mt-4 mb-2 text-xl font-semibold text-foreground first:mt-0"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {renderChildren(children, "h1")}
              </h1>
            ),
            h2: ({ children }) => (
              <h2
                className="mt-4 mb-2 text-lg font-semibold text-foreground first:mt-0"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {renderChildren(children, "h2")}
              </h2>
            ),
            h3: ({ children }) => (
              <h3
                className="mt-3 mb-1.5 text-base font-semibold text-foreground first:mt-0"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {renderChildren(children, "h3")}
              </h3>
            ),
            blockquote: ({ children }) => (
              <blockquote className="mb-4 border-l-2 border-primary/40 pl-3 italic text-foreground/75 last:mb-0">
                {renderChildren(children, "bq")}
              </blockquote>
            ),
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener"
                className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              >
                {renderChildren(children, "a")}
              </a>
            ),
            code: ({ children }) => (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
                {renderChildren(children, "code")}
              </code>
            ),
          }, makeChip)}
        >
          {preprocessCitations(answer)}
        </ReactMarkdown>
      </div>

      {/* Feedback + follow-ups row */}
      {!isStreaming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...fade.smooth, delay: 0.2 }}
          className="relative mt-6 border-t border-border/50 pt-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FeedbackWidget
              targetId={`ai-answer-${sources[0]?.chunk.chunk_id ?? "none"}`}
              context="ai_answer"
            />
            {/*
              "Keep chatting" — opens a new chat conversation seeded
              with the original query and this AI answer (with the
              same sources attached). Only shown to authenticated
              users since chat history requires an account.
            */}
            {user.isAuthenticated && query && answer && (
              <button
                type="button"
                onClick={handleKeepChatting}
                disabled={isCreatingConversation}
                className={cn(
                  "group inline-flex items-center gap-2 rounded-full",
                  "border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium",
                  "text-primary shadow-[inset_0_0_0_1px_var(--color-primary-soft)]",
                  "transition-all hover:bg-primary/15 hover:border-primary/50",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                )}
              >
                <MessageSquarePlus className="h-4 w-4" />
                {/* TODO: thread these strings through I18nProvider once
                    the keepChatting/keepChattingLoading keys are added
                    to web/src/lib/i18n/translations.ts */}
                {isCreatingConversation ? "Opening chat…" : "Keep chatting"}
                <ArrowUpRight className="h-3.5 w-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
              </button>
            )}
          </div>

          {/* Suggested follow-ups */}
          <div className="mt-4">
            <div
              className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground/70"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
            >
              Suggested follow-ups
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FOLLOWUP_SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  className="group flex items-center gap-1 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-card hover:border-primary/30 hover:text-foreground transition-all"
                >
                  {q}
                  <ArrowUpRight className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Sources section */}
      {sources.length > 0 && !isStreaming && (
        <div className="relative mt-5 border-t border-border/50 pt-4">
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {sources.length} {t("search.sourcesUsed")}
            {sourcesExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          {sourcesExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={spring.gentle}
              className="mt-3 grid gap-2 overflow-hidden"
            >
              {sources.map((s, i) => (
                <a
                  key={s.chunk.chunk_id}
                  href={buildSourceViewerUrl(s.chunk)}
                  target="_blank"
                  rel="noopener"
                  className="group flex items-start gap-2.5 rounded-lg border border-border/50 bg-card/80 p-3 text-xs no-underline hover:bg-card hover:border-primary/30 hover:shadow-[var(--shadow-sm)] transition-all"
                >
                  <CitationChip number={i + 1} className="pointer-events-none" />
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-semibold text-foreground group-hover:text-primary"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {cleanSourceTitle(s.chunk.title)}
                    </div>
                    {(s.chunk.author_speaker ||
                      formatSourceLocator(s.chunk).length > 0) && (
                      <div className="text-muted-foreground text-[11px]">
                        {[s.chunk.author_speaker, ...formatSourceLocator(s.chunk)]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    <p className="mt-1 text-muted-foreground/80 text-[11px] leading-relaxed">
                      {truncate(s.chunk.text, 140)}
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}
