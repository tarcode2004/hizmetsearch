/**
 * Public read-only view of a shared conversation. Anyone with the share
 * token can access this route — no auth required. The Convex query
 * `queries.conversations.getShared` enforces that the token actually
 * exists before returning data.
 */
import { useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import ReactMarkdown from "react-markdown";
import { BookOpenText, Compass, Shield, ExternalLink } from "lucide-react";
import { api } from "@convex/api";
import { cn, detectArabicScript, truncate } from "@/lib/utils";
import { CitationChip } from "@/components/ornaments/CitationChip";
import { LanguageBadge } from "@/components/shared/LanguageBadge";
import { buildSourceViewerUrl } from "@/lib/source-viewer";
import { BACKEND_ENABLED } from "@/lib/env";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import type { ChunkResult } from "@/lib/types";

export function SharedConversationPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const data = useQuery(
    api.queries.conversations.getShared,
    BACKEND_ENABLED && token ? { token } : "skip"
  );

  if (!BACKEND_ENABLED) {
    return <CenteredNotice title={t("share.requiresBackend")} />;
  }
  if (!token) {
    return <CenteredNotice title={t("share.invalid")} />;
  }
  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        {t("share.loading")}
      </div>
    );
  }
  if (data === null) {
    return (
      <CenteredNotice
        title={t("share.notFound.title")}
        subtitle={t("share.notFound.subtitle")}
      />
    );
  }

  const { conversation, messages, author } = data;

  return (
    <div className="min-h-screen bg-background">
      {/* Public header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <BookOpenText className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span
              className="text-foreground"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                fontWeight: 600,
              }}
            >
              HizmetSearch
            </span>
          </Link>
          <Link
            to="/"
            className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors no-underline"
          >
            {t("share.tryYourself")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {t("share.label")}
        </div>
        <h1
          className="text-2xl font-semibold text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
        >
          {conversation.title}
        </h1>
        {author && (
          <p
            className="mt-1 text-sm text-muted-foreground"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            {t("share.byAuthor")} {author}
          </p>
        )}

        <div className="mt-10 space-y-8">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              {t("share.empty")}
            </p>
          )}
          {(messages as SharedMessage[]).map((msg) => (
            <SharedMessage key={msg._id} message={msg} />
          ))}
        </div>

        <footer className="mt-16 border-t border-border pt-6 text-center">
          <p className="text-xs text-muted-foreground">
            {t("share.snapshot")}
          </p>
          <Link
            to="/chat"
            className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground no-underline hover:bg-primary/90 transition-colors"
          >
            {t("share.startOwn")}
          </Link>
        </footer>
      </main>
    </div>
  );
}

interface SharedMessage {
  _id: string;
  role: "user" | "assistant";
  content: string;
  model?: "gemini" | "claude";
  sources?: ChunkResult[];
  createdAt: number;
}

function SharedMessage({ message }: { message: SharedMessage }) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const isArabic = detectArabicScript(message.content);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          dir={isArabic ? "rtl" : "ltr"}
          className={cn(
            "max-w-[80%] text-right text-[15px] leading-relaxed text-foreground/90",
            isArabic && "font-[var(--font-arabic)] text-base"
          )}
        >
          <span
            className="mr-1.5 select-none text-primary/70"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ›
          </span>
          {message.content}
        </div>
      </div>
    );
  }

  const ModelIcon = message.model === "claude" ? Shield : Compass;
  const accent =
    message.model === "claude" ? "var(--color-gilt)" : "var(--color-primary)";

  // Render [N] markers as citation chips with rich tooltip preview
  const renderBody = (text: string) => {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const num = parseInt(match[1]);
        const src = message.sources?.[num - 1];
        const href = src ? buildSourceViewerUrl(src) : "#";
        return (
          <CitationChip
            key={i}
            number={num}
            href={href}
            target="_blank"
            rel="noopener"
            tooltip={
              src ? (
                <div className="w-[280px] p-3">
                  <p
                    className="text-[13px] font-semibold text-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {src.title}
                  </p>
                  {src.author_speaker && (
                    <p className="text-[10px] text-muted-foreground">
                      {src.author_speaker}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] leading-snug text-foreground/75 line-clamp-4">
                    {truncate(src.text, 220)}
                  </p>
                </div>
              ) : undefined
            }
          />
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="flex">
      <div
        className="min-w-0 flex-1 pl-4"
        style={{ borderLeft: `3px solid ${accent}` }}
      >
        <ModelIcon
          className={cn(
            "mr-1.5 inline-block align-[-2px]",
            message.model === "claude"
              ? "text-amber-700 dark:text-amber-300"
              : "text-blue-700 dark:text-blue-300"
          )}
          style={{ width: 12, height: 12 }}
        />
        <div
          dir={isArabic ? "rtl" : "ltr"}
          className={cn(
            "text-foreground/90",
            isArabic && "font-[var(--font-arabic)]"
          )}
          style={{ fontSize: "1rem", lineHeight: 1.65 }}
        >
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p className="mb-3 last:mb-0">
                  {typeof children === "string" ? renderBody(children) : children}
                </p>
              ),
              em: ({ children }) => (
                <em
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                  }}
                >
                  {children}
                </em>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {message.sources && message.sources.length > 0 && (
          <div className="mt-4 border-t border-border/40 pt-3">
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mb-2">
              {message.sources.length} {t("share.sources")}
            </div>
            <div className="grid gap-1.5">
              {message.sources.map((src, i) => (
                <a
                  key={src.chunk_id}
                  href={buildSourceViewerUrl(src)}
                  target="_blank"
                  rel="noopener"
                  className="group flex items-start gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-[11px] no-underline text-foreground hover:bg-card hover:border-primary/20 transition-all"
                >
                  <CitationChip
                    number={i + 1}
                    className="pointer-events-none shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <span
                      className="font-semibold group-hover:text-primary transition-colors"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {src.title}
                    </span>
                    {src.author_speaker && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {src.author_speaker}
                      </span>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredNotice({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <h1
        className="text-2xl font-semibold text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2 max-w-[44ch] text-sm text-muted-foreground">
          {subtitle}
        </p>
      )}
      <Link
        to="/"
        className="mt-6 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground no-underline hover:bg-muted transition-colors"
      >
        {t("share.back")}
      </Link>
    </div>
  );
}
