import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchToggle } from "@/components/search/SearchToggle";
import { FilterPanel } from "@/components/search/FilterPanel";
import { ResultsList } from "@/components/search/ResultsList";
import { AIAnswer } from "@/components/search/AIAnswer";
import { SearchHistorySidebar } from "@/components/search/SearchHistorySidebar";
import { Loader2, Menu, X, RefreshCw, AlertCircle } from "lucide-react";
import type { SearchMode } from "@/lib/types";
import { MOCK_RESULTS, MOCK_AI_ANSWER } from "@/lib/mock-data";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import {
  useSearchHistory,
  type SearchHistoryEntry,
} from "@/lib/search/SearchHistoryProvider";
import { cn } from "@/lib/utils";

export function SearchPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") ?? "";
  const [mode, setMode] = useState<SearchMode>(
    (searchParams.get("mode") as SearchMode) ?? "results"
  );
  const [language, setLanguage] = useState<string | null>(null);
  const [collection, setCollection] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | undefined>();
  const [cachedResults, setCachedResults] = useState<typeof MOCK_RESULTS | null>(
    null
  );
  const [isRerunning, setIsRerunning] = useState(false);
  const [showStaleNotice, setShowStaleNotice] = useState(false);

  const { add: addHistory, refresh: refreshHistory } = useSearchHistory();
  const lastLoggedQueryRef = useRef<string>("");

  // On desktop default to sidebar open
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setSidebarOpen(true);
    }
  }, []);

  // In production, this would call Convex action with filters
  const allResults = cachedResults ?? MOCK_RESULTS;
  const aiAnswer = MOCK_AI_ANSWER;
  const isLoading = false;

  // Apply client-side filters to results
  const filteredResults = useMemo(() => {
    return allResults.filter((r) => {
      if (language && r.chunk.language !== language) return false;
      if (collection && r.chunk.collection !== collection) return false;
      return true;
    });
  }, [allResults, language, collection]);

  // Log to history when query changes (avoid double-logging)
  useEffect(() => {
    if (!query.trim()) return;
    const key = `${query}::${language ?? ""}::${collection ?? ""}::${mode}`;
    if (lastLoggedQueryRef.current === key) return;
    lastLoggedQueryRef.current = key;

    const id = addHistory({
      query,
      language,
      collection,
      mode,
      resultCount: filteredResults.length,
      cachedResults: filteredResults,
      cachedAiAnswer: mode === "ai" ? aiAnswer : undefined,
    });
    setActiveHistoryId(id);
  }, [query, language, collection, mode, filteredResults, addHistory, aiAnswer]);

  const handleSelectHistory = (entry: SearchHistoryEntry) => {
    setActiveHistoryId(entry.id);
    setCachedResults(entry.cachedResults);
    setMode(entry.mode);
    setLanguage(entry.language);
    setCollection(entry.collection);
    if (entry.isStale) setShowStaleNotice(true);
    setSidebarOpen(false);
    // Update URL via React Router so SearchBar re-syncs
    const params = new URLSearchParams();
    params.set("q", entry.query);
    if (entry.mode === "ai") params.set("mode", "ai");
    // Prevent the useEffect from re-adding to history for this specific navigation
    lastLoggedQueryRef.current = `${entry.query}::${entry.language ?? ""}::${entry.collection ?? ""}::${entry.mode}`;
    navigate(`/search?${params.toString()}`, { replace: true });
  };

  const handleRerun = (entry: SearchHistoryEntry) => {
    setActiveHistoryId(entry.id);
    setIsRerunning(true);
    setShowStaleNotice(false);
    // Simulate API call to refetch
    setTimeout(() => {
      refreshHistory(entry.id, MOCK_RESULTS);
      setCachedResults(MOCK_RESULTS);
      setIsRerunning(false);
    }, 800);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden relative">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-20 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-lg border border-border md:hidden"
        title={t("history.toggle")}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed md:relative inset-y-0 left-0 z-30 transform transition-transform md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SearchHistorySidebar
          activeId={activeHistoryId}
          onSelect={handleSelectHistory}
          onRerun={handleRerun}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6">
          {/* Search bar */}
          <div className="mb-6">
            <SearchBar initialQuery={query} />
          </div>

          {/* Stale notice */}
          {showStaleNotice && activeHistoryId && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" />
                {t("history.staleHint")}
              </div>
              <button
                onClick={() => {
                  const entry = { id: activeHistoryId } as SearchHistoryEntry;
                  handleRerun(entry);
                }}
                className="flex shrink-0 items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                {t("history.rerun")}
              </button>
            </div>
          )}

          {/* Controls */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchToggle mode={mode} onChange={setMode} />
            <FilterPanel
              language={language}
              collection={collection}
              onLanguageChange={setLanguage}
              onCollectionChange={setCollection}
              resultCount={filteredResults.length}
              retrievalTimeMs={142}
            />
          </div>

          {/* Loading */}
          {(isLoading || isRerunning) && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">
                {t("search.searching")}
              </span>
            </div>
          )}

          {/* Results */}
          {!isLoading && !isRerunning && (
            <div className="space-y-4">
              {mode === "ai" && (
                <AIAnswer answer={aiAnswer} sources={filteredResults} />
              )}
              <ResultsList results={filteredResults} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
