import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { Compass, Shield, BookOpen, ChevronDown, ChevronUp, ExternalLink, Telescope, Loader2 } from "lucide-react";
import { cn, detectArabicScript, truncate } from "@/lib/utils";
import { LanguageBadge } from "@/components/shared/LanguageBadge";
import { FeedbackWidget } from "@/components/shared/FeedbackWidget";
import { CitationChip } from "@/components/ornaments/CitationChip";
import type { ChunkResult, Message } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { buildSourceViewerUrl } from "@/lib/source-viewer";
import { fadeInUp, spring } from "@/lib/motion";

interface MessageBubbleProps {
  message: Message;
  /** When provided, citation clicks open the in-page preview instead of a new tab. */
  onCitationSelect?: (source: ChunkResult) => void;
}

// Citation preprocessing — same trick as AIAnswer. CommonMark eats `[N]`
// as a shortcut reference link, so we replace `[N]` with private-use
// Unicode placeholders BEFORE handing the text to ReactMarkdown, then
// swap them back into chips after parsing.
//
// We accept several LLM-generated citation shapes:
//   [1]            single
//   [1][2]         adjacent (handled by chained matches)
//   [1, 2, 3]      comma list — expanded into 3 separate chips
//   [1-3]          range — expanded into 1, 2, 3
//   [Source 1]     prose form — caught and normalized to [1]
const CITE_OPEN = "\uE000";
const CITE_CLOSE = "\uE001";
const CITE_PLACEHOLDER_RE = new RegExp(
  `${CITE_OPEN}(\\d+)${CITE_CLOSE}`,
  "g",
);

function expandRangeOrList(inner: string): number[] {
  const out: number[] = [];
  for (const part of inner.split(/\s*,\s*/)) {
    const range = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a <= b && b - a < 20) {
        for (let i = a; i <= b; i++) out.push(i);
        continue;
      }
    }
    const single = part.match(/^\d+$/);
    if (single) out.push(Number(single[0]));
  }
  return out;
}

function preprocessCitations(text: string): string {
  // Match a bracketed citation that contains only numbers, commas, and
  // dash-style range separators. Optionally preceded by "Source", "Src",
  // "Kaynak", "Source:" etc. so prose forms get normalized too.
  return text.replace(
    /\[\s*(?:source|src|kaynak)?\s*:?\s*([\d,\s\-–—]+)\s*\]/gi,
    (_match, inner) => {
      const nums = expandRangeOrList(inner);
      if (nums.length === 0) return _match;
      return nums.map((n) => `${CITE_OPEN}${n}${CITE_CLOSE}`).join("");
    },
  );
}

function CitationTooltipContent({ source }: { source: ChunkResult }) {
  const isArabic = detectArabicScript(source.text);
  const meta: string[] = [];
  if (source.author_speaker) meta.push(source.author_speaker);
  if (source.page_number != null) meta.push(`p. ${source.page_number}`);
  else if (source.timestamp_start != null) {
    const m = Math.floor(source.timestamp_start / 60);
    const s = Math.floor(source.timestamp_start % 60).toString().padStart(2, "0");
    meta.push(`${m}:${s}`);
  }
  return (
    <div className="w-[300px] p-3">
      <p
        className="text-[13px] font-semibold text-foreground leading-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {source.title}
      </p>
      {meta.length > 0 && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {meta.join(" · ")}
        </p>
      )}
      <p
        dir={isArabic ? "rtl" : "ltr"}
        className={cn(
          "mt-2 text-[11px] leading-snug text-foreground/75 line-clamp-4",
          isArabic && "font-[var(--font-arabic)] text-[13px]"
        )}
      >
        {truncate(source.text, 220)}
      </p>
    </div>
  );
}

export function MessageBubble({ message, onCitationSelect }: MessageBubbleProps) {
  const { t } = useTranslation();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const isUser = message.role === "user";
  const isArabic = detectArabicScript(message.content);

  // Build a chip element for one citation number.
  const makeChip = (num: number, key: string) => {
    const src = message.sources?.[num - 1];
    const href = src ? buildSourceViewerUrl(src) : "#";
    const handleClick =
      src && onCitationSelect
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            onCitationSelect(src);
          }
        : undefined;
    return (
      <CitationChip
        key={key}
        number={num}
        href={href}
        onClick={handleClick}
        tooltip={src ? <CitationTooltipContent source={src} /> : undefined}
        target={onCitationSelect ? undefined : "_blank"}
        rel={onCitationSelect ? undefined : "noopener"}
      />
    );
  };

  // Replace placeholder-wrapped citation numbers with chips inside a
  // string. Used by `renderChildren` below.
  const renderText = (text: string, baseKey: string): React.ReactNode[] => {
    const parts = text.split(CITE_PLACEHOLDER_RE);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return makeChip(parseInt(part, 10), `${baseKey}-c${i}`);
      }
      return part ? <span key={`${baseKey}-t${i}`}>{part}</span> : null;
    });
  };

  // Recursively walk a React children tree, replacing placeholders in any
  // string node with chips. Handles arrays of mixed text + inline markup
  // (em, strong, code, etc.) — earlier the citation logic only fired for
  // plain-string children and silently dropped chips inside formatted runs.
  const renderChildren = (
    children: React.ReactNode,
    baseKey: string,
  ): React.ReactNode => {
    if (typeof children === "string") {
      return renderText(children, baseKey);
    }
    if (Array.isArray(children)) {
      return children.map((c, i) => renderChildren(c, `${baseKey}-${i}`));
    }
    if (React.isValidElement(children)) {
      const el = children as React.ReactElement<{ children?: React.ReactNode }>;
      return React.cloneElement(el, {
        children: renderChildren(el.props.children, `${baseKey}-x`),
      });
    }
    return children;
  };

  if (isUser) {
    return (
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="show"
        className="flex justify-end"
      >
        <div
          dir={isArabic ? "rtl" : "ltr"}
          className={cn(
            "max-w-[80%] text-right text-[15px] leading-relaxed text-foreground/90",
            isArabic && "font-[var(--font-arabic)] text-base"
          )}
        >
          <span className="mr-1.5 select-none text-primary/70" style={{ fontFamily: "var(--font-display)" }}>
            ›
          </span>
          {message.content}
        </div>
      </motion.div>
    );
  }

  // ─── Assistant message — borderless scholarly rendering ───
  const ModelIcon = message.model === "claude" ? Shield : Compass;
  const modelColor = message.model === "claude" ? "amber" : "blue";
  // tezhib-green (primary) for Gemini, gold-leaf (gilt) for Claude
  const accentColor =
    message.model === "claude" ? "var(--color-gilt)" : "var(--color-primary)";

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      className="flex"
    >
      {/* Content column with 3px left border in model color */}
      <div
        className="min-w-0 flex-1 pl-4"
        style={{
          maxWidth: "720px",
          borderLeft: `3px solid ${accentColor}`,
        }}
      >
        {/* Tiny inline model indicator at the top of the first line */}
        <ModelIcon
          className={cn(
            "mr-1.5 inline-block align-[-2px]",
            modelColor === "amber"
              ? "text-amber-700 dark:text-amber-300"
              : "text-blue-700 dark:text-blue-300"
          )}
          style={{ width: 12, height: 12 }}
        />
        <div
          dir={isArabic ? "rtl" : "ltr"}
          className={cn(
            "text-foreground/90",
            isArabic && "font-[var(--font-arabic)]",
            message.isStreaming && "streaming-cursor"
          )}
          style={{
            fontSize: "1rem",
            lineHeight: 1.65,
          }}
        >
          {/* Agentic deep-search progress / plan. Shown above the answer. */}
          {(message.agenticStatus || (message.agenticSteps && message.agenticSteps.length > 0)) && (
            <AgenticPlan
              steps={message.agenticSteps ?? []}
              status={message.agenticStatus}
              isStreaming={!!message.isStreaming}
            />
          )}
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p className="mb-3 last:mb-0">
                  {renderChildren(children, "p")}
                </p>
              ),
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
              ul: ({ children }) => (
                <ul className="mb-3 ml-5 list-disc space-y-1 last:mb-0 marker:text-muted-foreground/60">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 ml-5 list-decimal space-y-1 last:mb-0 marker:text-muted-foreground/60">
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
                <blockquote className="mb-3 border-l-2 border-primary/40 pl-3 italic text-foreground/75 last:mb-0">
                  {renderChildren(children, "bq")}
                </blockquote>
              ),
              code: ({ children }) => (
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
                  {renderChildren(children, "code")}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="mb-3 overflow-x-auto rounded-lg bg-muted p-3 text-[0.85em] last:mb-0">
                  {children}
                </pre>
              ),
              hr: () => <hr className="my-4 border-border/60" />,
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
            }}
          >
            {preprocessCitations(message.content)}
          </ReactMarkdown>
        </div>

        {/* Sources collapser */}
        {message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="mt-4">
            <button
              onClick={() => setSourcesOpen(!sourcesOpen)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <BookOpen className="h-3 w-3" />
              {message.sources.length} {t("chat.sources")}
              {sourcesOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>

            {sourcesOpen && (
              <motion.div
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.gentle}
                className="mt-2 grid gap-1.5"
              >
                {message.sources.map((src, i) => (
                  <a
                    key={src.chunk_id}
                    href={buildSourceViewerUrl(src)}
                    target={onCitationSelect ? undefined : "_blank"}
                    rel={onCitationSelect ? undefined : "noopener"}
                    onClick={
                      onCitationSelect
                        ? (e) => {
                            e.preventDefault();
                            onCitationSelect(src);
                          }
                        : undefined
                    }
                    className="group flex items-start gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-[11px] no-underline text-foreground hover:bg-card hover:border-primary/20 transition-all"
                  >
                    <CitationChip number={i + 1} className="pointer-events-none shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span
                        className="font-semibold group-hover:text-primary transition-colors"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {src.title}
                      </span>
                      {src.author_speaker && (
                        <span className="text-muted-foreground"> — {src.author_speaker}</span>
                      )}
                      <p className="mt-0.5 text-muted-foreground leading-relaxed">
                        {truncate(src.text, 120)}
                      </p>
                      <div className="mt-1">
                        <LanguageBadge language={src.language} />
                      </div>
                    </div>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* Footer — model badge + feedback */}
        {!message.isStreaming && (
          <div className="mt-3 flex items-center gap-2">
            {message.model && (
              <span
                className={cn(
                  "inline-block rounded-full px-2 py-0.5 text-[10px]",
                  modelColor === "amber"
                    ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
                )}
                style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
              >
                {message.model === "claude"
                  ? `${t("chat.modelClaude")} · ${t("chat.modePrecision")}`
                  : `${t("chat.modelGemini")} · ${t("chat.modeExploration")}`}
              </span>
            )}
            <FeedbackWidget
              targetId={message._id}
              context="chat_message"
              model={message.model}
              compact
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Compact display for the agentic search plan + live status. While
 * `isStreaming` is true the live status line shows what the agent is
 * doing right now (e.g. "Searching: niyetin önemi"); after streaming
 * ends the steps array remains as a permanent record of the plan.
 */
function AgenticPlan({
  steps,
  status,
  isStreaming,
}: {
  steps: Array<{ query: string; resultCount: number; reasoning?: string }>;
  status?: string;
  isStreaming: boolean;
}) {
  const [expanded, setExpanded] = useState(isStreaming);
  // Auto-expand while streaming so the user can watch progress; collapse
  // by default once the answer is finalized.
  useEffect(() => {
    if (isStreaming) setExpanded(true);
  }, [isStreaming]);
  const totalSources = steps.reduce((n, s) => n + s.resultCount, 0);

  return (
    <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-[11px] text-primary"
      >
        <Telescope className="h-3 w-3" />
        <span className="font-semibold uppercase tracking-wider">
          Deep search
        </span>
        <span className="text-muted-foreground normal-case tracking-normal">
          {steps.length} {steps.length === 1 ? "search" : "searches"} ·{" "}
          {totalSources} sources
        </span>
        {isStreaming && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {steps.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-[11px] text-foreground/80"
            >
              <span className="mt-0.5 inline-block w-4 shrink-0 text-right text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <span className="font-medium text-foreground">{s.query}</span>
                  <span className="ml-2 text-muted-foreground">
                    +{s.resultCount}
                  </span>
                </div>
                {s.reasoning && (
                  <div className="text-[10px] italic text-muted-foreground/80">
                    {s.reasoning}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isStreaming && status && (
            <div className="mt-1 flex items-center gap-2 text-[11px] italic text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {status}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
