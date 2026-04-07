import {
  Clock,
  Search as SearchIcon,
  RefreshCw,
  Trash2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { cn, detectArabicScript, truncate } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import {
  useSearchHistory,
  type SearchHistoryEntry,
} from "@/lib/search/SearchHistoryProvider";

interface SearchHistorySidebarProps {
  activeId?: string;
  onSelect: (entry: SearchHistoryEntry) => void;
  onRerun: (entry: SearchHistoryEntry) => void;
}

export function SearchHistorySidebar({
  activeId,
  onSelect,
  onRerun,
}: SearchHistorySidebarProps) {
  const { t, locale } = useTranslation();
  const { history, remove, clear } = useSearchHistory();

  const formatRelative = (createdAt: number): string => {
    const diffMs = Date.now() - createdAt;
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return t("history.justNow");
    if (diffMin < 60) return `${diffMin} ${t("history.minutesAgo")}`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} ${t("history.hoursAgo")}`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} ${t("history.daysAgo")}`;
    return new Date(createdAt).toLocaleDateString(
      locale === "tr" ? "tr-TR" : "en-US"
    );
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Clock className="h-3.5 w-3.5" />
          {t("history.title")}
        </h3>
        {history.length > 0 && (
          <button
            onClick={clear}
            className="text-[10px] text-muted-foreground hover:text-red-600 transition-colors"
          >
            {t("history.clearAll")}
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {history.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <SearchIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs font-medium text-muted-foreground">
              {t("history.empty")}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              {t("history.emptyHint")}
            </p>
          </div>
        ) : (
          <div className="grid gap-0.5">
            {history.map((entry) => {
              const isArabic = detectArabicScript(entry.query);
              const isActive = entry.id === activeId;

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "group relative rounded-lg px-2.5 py-2 transition-colors",
                    isActive
                      ? "bg-primary/10"
                      : "hover:bg-muted"
                  )}
                >
                  <button
                    onClick={() => onSelect(entry)}
                    className="block w-full text-left"
                  >
                    {/* Query */}
                    <div className="flex items-start gap-1.5">
                      {entry.mode === "ai" ? (
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                      ) : (
                        <SearchIcon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <p
                        dir={isArabic ? "rtl" : "ltr"}
                        className={cn(
                          "flex-1 truncate text-xs font-medium",
                          isActive ? "text-foreground" : "text-foreground/80",
                          isArabic && "font-[var(--font-arabic)] text-sm text-right"
                        )}
                      >
                        {truncate(entry.query, 48)}
                      </p>
                    </div>

                    {/* Meta */}
                    <div className="mt-1 flex items-center gap-1.5 pl-4.5 text-[10px] text-muted-foreground">
                      <span>
                        {entry.resultCount} {t("history.results")}
                      </span>
                      <span>·</span>
                      <span>{formatRelative(entry.createdAt)}</span>
                      {entry.isStale && (
                        <span
                          className="flex items-center gap-0.5 text-amber-600"
                          title={t("history.staleHint")}
                        >
                          <AlertCircle className="h-2.5 w-2.5" />
                          {t("history.stale")}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Actions (visible on hover) */}
                  <div className="absolute right-1 top-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRerun(entry);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-card hover:text-primary transition-colors"
                      title={t("history.rerun")}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(entry.id);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-card hover:text-red-600 transition-colors"
                      title={t("history.delete")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
