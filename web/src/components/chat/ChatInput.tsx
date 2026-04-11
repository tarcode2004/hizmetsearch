import { useState, useRef } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn, detectArabicScript } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, isLoading = false, disabled = false }: ChatInputProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isArabic = detectArabicScript(input);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading && !disabled) {
      onSend(input.trim());
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-border bg-card p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="flex-1 rounded-xl border border-input bg-background px-3 py-2 focus-within:border-primary/40 focus-within:shadow-sm transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={`${t("chat.placeholder")} | اسأل سؤالاً`}
            dir={isArabic ? "rtl" : "ltr"}
            rows={1}
            wrap="soft"
            disabled={disabled}
            className={cn(
              // `whitespace-pre-wrap break-words` make sure long lines wrap
              // visually instead of overflowing horizontally; auto-resize
              // height is handled in handleInput.
              "w-full resize-none overflow-y-auto bg-transparent pl-1 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:!shadow-none whitespace-pre-wrap break-words leading-relaxed",
              isArabic && "font-[var(--font-arabic)] text-base text-right"
            )}
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || isLoading || disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </form>
  );
}
