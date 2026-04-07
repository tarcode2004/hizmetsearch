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
  const inputRef = useRef<HTMLInputElement>(null);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit}>
        <div
          className={cn(
            "relative flex items-center rounded-2xl border bg-card shadow-sm transition-all",
            focused ? "border-primary shadow-md ring-2 ring-primary/20" : "border-border",
            large ? "px-5 py-4" : "px-4 py-2.5"
          )}
        >
          <Search className={cn("shrink-0 text-muted-foreground", large ? "h-6 w-6" : "h-5 w-5")} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder={`${t("search.placeholder")} | ابحث في المصادر الإسلامية`}
            autoFocus={autoFocus}
            dir={isArabic ? "rtl" : "ltr"}
            className={cn(
              "flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60",
              large ? "mx-4 text-lg" : "mx-3 text-sm",
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
