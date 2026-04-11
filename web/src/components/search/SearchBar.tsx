import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import { cn, detectArabicScript } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface SearchBarProps {
  initialQuery?: string;
  large?: boolean;
  autoFocus?: boolean;
}

const SUGGESTIONS = [
  "İman hakikatleri nelerdir?",
  "Namaz neden önemlidir?",
  "Risale-i Nur'da kader bahsi",
  "ما هو الإيمان؟",
  "What is the First Word about?",
  "Hizmet hareketi ve diyalog",
];

export function SearchBar({ initialQuery = "", large = false, autoFocus = false }: SearchBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  // Switched from <input> to <textarea> so long queries wrap onto multiple
  // lines instead of scrolling horizontally off-screen. We grow the
  // height with the content (max ~5 lines), preserve Enter-to-submit, and
  // allow Shift+Enter for explicit line breaks just like a proper editor.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const isArabic = detectArabicScript(query);

  // Re-sync when parent passes a new initialQuery (e.g. history click updates URL)
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Auto-grow the textarea so it expands as text wraps. Cap height so a
  // pasted essay doesn't push the page around — it scrolls inside the
  // textarea once we hit the cap.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, large ? 160 : 120) + "px";
  }, [query, large]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits, Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit}>
        <div
          className={cn(
            "relative flex items-start rounded-2xl border bg-card shadow-sm transition-all",
            focused ? "border-primary/40 shadow-md" : "border-border",
            large ? "px-5 py-4" : "px-4 py-2.5"
          )}
        >
          <Search
            className={cn(
              "mt-0.5 shrink-0 text-muted-foreground",
              large ? "h-6 w-6" : "h-5 w-5",
            )}
          />
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder={`${t("search.placeholder")} | ابحث في المصادر الإسلامية`}
            autoFocus={autoFocus}
            dir={isArabic ? "rtl" : "ltr"}
            rows={1}
            wrap="soft"
            className={cn(
              "flex-1 resize-none overflow-y-auto bg-transparent outline-none placeholder:text-muted-foreground/60 focus-visible:!shadow-none whitespace-pre-wrap break-words leading-relaxed",
              large ? "mx-4 pl-1 text-lg" : "mx-3 pl-0.5 text-sm",
              isArabic && "font-[var(--font-arabic)] text-right"
            )}
          />
          {query.trim() && (
            <button
              type="submit"
              className={cn(
                "flex items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                large ? "py-2.5" : "py-1.5"
              )}
            >
              <Sparkles className="h-4 w-4" />
              {t("search.button")}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </form>

      {large && focused && !query && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={() => {
                setQuery(s);
                navigate(`/search?q=${encodeURIComponent(s)}`);
              }}
              className={cn(
                "rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                detectArabicScript(s) && "font-[var(--font-arabic)]"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
