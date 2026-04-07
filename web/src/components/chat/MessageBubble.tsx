import ReactMarkdown from "react-markdown";
import { User, Bot, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn, detectArabicScript, truncate } from "@/lib/utils";
import { LanguageBadge } from "@/components/shared/LanguageBadge";
import { FeedbackWidget } from "@/components/shared/FeedbackWidget";
import type { Message } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useTranslation();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const isUser = message.role === "user";
  const isArabic = detectArabicScript(message.content);

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary/10" : message.model === "claude" ? "bg-amber-100" : "bg-blue-100"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className={cn("h-4 w-4", message.model === "claude" ? "text-amber-700" : "text-blue-700")} />
        )}
      </div>

      {/* Content */}
      <div className={cn("max-w-[80%] min-w-0", isUser && "text-right")}>
        <div
          dir={isArabic ? "rtl" : "ltr"}
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted/70 text-foreground rounded-bl-md",
            isArabic && "font-[var(--font-arabic)] text-base",
            message.isStreaming && "streaming-cursor"
          )}
        >
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="mt-1.5">
            <button
              onClick={() => setSourcesOpen(!sourcesOpen)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <BookOpen className="h-3 w-3" />
              {message.sources.length} {t("chat.sources")}
              {sourcesOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {sourcesOpen && (
              <div className="mt-1.5 grid gap-1">
                {message.sources.map((src, i) => (
                  <div key={src.chunk_id} className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-[11px]">
                    <span className="shrink-0 text-primary font-bold">[{i + 1}]</span>
                    <div className="min-w-0">
                      <span className="font-medium">{src.title}</span>
                      {src.author_speaker && <span className="text-muted-foreground"> — {src.author_speaker}</span>}
                      <p className="mt-0.5 text-muted-foreground">{truncate(src.text, 120)}</p>
                      <LanguageBadge language={src.language} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Model badge + feedback for assistant */}
        {!isUser && !message.isStreaming && (
          <div className="mt-1 flex items-center gap-2">
            {message.model && (
              <span className={cn(
                "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                message.model === "claude"
                  ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
              )}>
                {message.model === "claude"
                  ? `${t("chat.modelClaude")} — ${t("chat.modePrecision")}`
                  : `${t("chat.modelGemini")} — ${t("chat.modeExploration")}`}
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
    </div>
  );
}
