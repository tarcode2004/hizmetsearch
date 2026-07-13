import { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchToggle } from "@/components/search/SearchToggle";
import { FilterPanel } from "@/components/search/FilterPanel";
import { ResultsList } from "@/components/search/ResultsList";
import { AIAnswer } from "@/components/search/AIAnswer";
import { DeepResearchButton } from "@/components/search/DeepResearchButton";
import { SearchHistorySidebar } from "@/components/search/SearchHistorySidebar";
import { Loader2, Menu, X, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import type { SearchMode, SearchResult } from "@/lib/types";
import { MOCK_RESULTS, MOCK_AI_ANSWER } from "@/lib/mock-data";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import {
  useSearchHistory,
  type SearchHistoryEntry,
} from "@/lib/search/SearchHistoryProvider";
import { cn, detectArabicScript } from "@/lib/utils";
import { buildSourceViewerUrl } from "@/lib/source-viewer";
import { SourceContextPanel } from "@/components/shared/SourceContextPanel";
import { BACKEND_ENABLED } from "@/lib/env";
import { captureError } from "@/lib/observability";

export function SearchPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") ?? "";
  // `?ls=<id>` survives browser back/forward navigation. When set, the
  // page restores the existing liveSearches row instead of starting a
  // fresh pipeline run. The search effect below seeds liveSearchId
  // from this on first render so the useQuery subscription picks up
  // the row's cached results + AI answer immediately.
  const urlLiveSearchId = searchParams.get("ls");
  const [mode, setMode] = useState<SearchMode>(
    (searchParams.get("mode") as SearchMode) ?? "results"
  );
  const [language, setLanguage] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | undefined>();
  const [cachedResults, setCachedResults] = useState<typeof MOCK_RESULTS | null>(
    null
  );
  const [isRerunning, setIsRerunning] = useState(false);
  const [showStaleNotice, setShowStaleNotice] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(true);
  // Resizable preview width — persisted across reloads. The drag handle on
  // the panel's left edge writes to this. Clamped at render time so a stale
  // localStorage value can't make the panel wider than the viewport.
  const [previewWidth, setPreviewWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 380;
    const saved = Number(window.localStorage.getItem("hs:previewWidth"));
    return Number.isFinite(saved) && saved >= 280 ? saved : 380;
  });
  const isResizingRef = useRef(false);
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      // Panel sits flush against the right edge — width is the distance
      // from the cursor back to the viewport edge.
      const next = Math.min(
        Math.max(window.innerWidth - ev.clientX, 280),
        Math.min(900, window.innerWidth - 320),
      );
      setPreviewWidth(next);
    };
    const onUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setPreviewWidth((w) => {
        try {
          window.localStorage.setItem("hs:previewWidth", String(w));
        } catch {
          /* ignore quota errors */
        }
        return w;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  const [liveResults, setLiveResults] = useState<SearchResult[] | null>(null);
  const [liveAiAnswer, setLiveAiAnswer] = useState<string | null>(null);
  const [liveExpansions, setLiveExpansions] = useState<string[]>([]);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  // Id of the in-flight `liveSearches` row this page is currently
  // subscribed to. Set when a new search starts; the useQuery below
  // re-fires whenever the row's status / resultsJson / aiAnswer
  // milestone updates land via Convex's reactive subscription.
  //
  // Seed from `?ls=<id>` so a browser-back navigation from /chat
  // restores the previously-rendered search without re-running the
  // expansion + retrieval + highlighting + synthesis pipeline. If the
  // restored row was already cleaned up (>30 min old), the row-watcher
  // effect detects the null and re-triggers a fresh search below.
  const [liveSearchId, setLiveSearchId] = useState<Id<"liveSearches"> | null>(
    urlLiveSearchId ? (urlLiveSearchId as Id<"liveSearches">) : null,
  );

  const { add: addHistory, refresh: refreshHistory } = useSearchHistory();
  const lastLoggedQueryRef = useRef<string>("");

  // Streaming search pipeline: a mutation creates a `liveSearches` row
  // and schedules an internal action to populate it through pipeline
  // milestones (expanding → retrieving → ranked → highlighting →
  // synthesizing → done). The page subscribes to that row via
  // useQuery and re-renders progressively as each milestone lands —
  // no need to wait 30+ seconds for the highlight pass to finish
  // before showing results.
  const startLiveSearch = useMutation(api.mutations.liveSearches.start);
  // Synthesize-only path: when the user toggles to AI mode on an
  // existing query, this re-uses the row's already-ranked results
  // instead of re-running expansion + fan-out + highlighting.
  const requestAiAnswer = useMutation(api.mutations.liveSearches.requestAiAnswer);
  const liveRow = useQuery(
    api.queries.liveSearches.get,
    liveSearchId ? { id: liveSearchId } : "skip",
  );

  // On desktop default to sidebar open
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setSidebarOpen(true);
    }
  }, []);

  // Track the (query, language, category) tuple of the last live fetch
  // so we can skip redundant fetches when the user only toggles the
  // results/ai mode. The retrieval results are identical regardless of
  // mode — only whether we ALSO request an AI synthesis differs — so
  // re-running the whole search on a mode toggle is wasted work.
  //
  // Seeded on mount when `?ls=<id>` is present so the search effect
  // skips a fresh pipeline run while we wait for the restored row to
  // load via useQuery. Without this seeding, browser-back from /chat
  // would re-run the full search even though the row already exists.
  const lastFetchKeyRef = useRef<string>(
    urlLiveSearchId ? `${query}::${language ?? ""}::${category ?? ""}` : "",
  );

  // Debounced query: prevents the expensive search pipeline (query
  // expansion + 4 fan-out RAG calls + 18 highlight LLM calls) from
  // firing on every individual keystroke. Only the value that's been
  // stable for 350 ms triggers the effect below — fast typing of
  // "namaz" used to fire 5 full pipelines back-to-back.
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Kick off a streaming search whenever the (query, language, category)
  // tuple changes. NB mode is intentionally NOT in the dependency tuple —
  // toggling between results and AI mode on the same query reuses the
  // existing liveSearches row via the synthesize-only effect below
  // instead of re-running expansion + fan-out + highlighting.
  useEffect(() => {
    if (!BACKEND_ENABLED) return;
    if (!debouncedQuery.trim()) {
      setLiveResults(null);
      setLiveAiAnswer(null);
      setLiveExpansions([]);
      setLiveSearchId(null);
      lastFetchKeyRef.current = "";
      return;
    }
    const fetchKey = `${debouncedQuery}::${language ?? ""}::${category ?? ""}`;
    const isNewSearch = lastFetchKeyRef.current !== fetchKey;
    if (!isNewSearch) return;
    lastFetchKeyRef.current = fetchKey;

    let cancelled = false;
    setIsLiveLoading(true);
    // Clear previous results so the loading skeleton shows immediately
    // instead of stale results from the previous query lingering on
    // screen while the new pipeline spins up.
    setLiveResults(null);
    setLiveAiAnswer(null);
    setLiveExpansions([]);

    startLiveSearch({
      query: debouncedQuery,
      // Always start in results mode on a fresh search. If the user is
      // currently on AI mode, the synthesize-only effect below will
      // kick in once the row finishes the highlighting stage and
      // populate the AI answer without a second retrieval pass.
      mode: mode === "ai" ? "ai_answer" : "results",
      language: language ?? undefined,
      category: (category ?? undefined) as
        | "risale"
        | "risale_dersleri"
        | "pirlanta"
        | "hizmet"
        | undefined,
    })
      .then((id) => {
        if (cancelled) return;
        setLiveSearchId(id);
        // Persist the row id in the URL so a browser-back from /chat
        // restores this exact search instead of re-running the
        // pipeline. `replace: true` so we don't pollute history.
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("ls", id);
            return next;
          },
          { replace: true },
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("startLiveSearch failed", err);
        captureError(err, { where: "search.start", query, mode });
        setLiveResults([]);
        setIsLiveLoading(false);
        toast.error(
          err instanceof Error ? err.message : "Search failed. Please try again.",
        );
      });
    return () => {
      cancelled = true;
    };
    // Intentionally omits `mode` — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, language, category, startLiveSearch, setSearchParams, query]);

  // Synthesize-only path: when the user toggles to AI Answer mode on
  // an existing search, schedule the synthesis pass against the row
  // that already has resultsJson populated. We deliberately don't
  // re-run retrieval — the same chunks the synthesis pass would
  // consume are already there, and re-running the whole pipeline
  // would burn 1-3 seconds for an identical answer.
  //
  // Guards:
  //   - skip if no row id yet (new search hasn't landed)
  //   - skip if not in AI mode
  //   - skip if the row already has an aiAnswer (re-toggling)
  //   - skip if the row hasn't reached resultsJson yet (still
  //     retrieving) — we'll re-fire when the row patches
  useEffect(() => {
    if (mode !== "ai") return;
    if (!liveSearchId) return;
    if (!liveRow) return;
    if (liveRow.aiAnswer) return;
    if (!liveRow.resultsJson) return;
    if (liveRow.status === "synthesizing") return; // already in flight
    requestAiAnswer({ id: liveSearchId }).catch((err) => {
      console.error("requestAiAnswer failed", err);
      captureError(err, { where: "search.requestAiAnswer", query });
      toast.error(
        err instanceof Error ? err.message : "AI answer failed. Try again.",
      );
    });
  }, [mode, liveSearchId, liveRow, requestAiAnswer, query]);

  // Stale-row recovery. If the page mounts with `?ls=<id>` pointing
  // at a row that's already been cleaned up by the 30-min cron (or
  // belonged to a different user), useQuery returns null after the
  // first fetch completes. In that case we drop the dead id and let
  // the search effect kick off a fresh pipeline run on the next
  // render. The `liveRow === null` check is deliberate — `undefined`
  // means "still loading", which we want to wait through.
  useEffect(() => {
    if (!liveSearchId) return;
    if (liveRow !== null) return;
    console.warn(
      "liveSearches row is gone, dropping stale ?ls and re-running search",
    );
    setLiveSearchId(null);
    lastFetchKeyRef.current = ""; // force the search effect to re-fire
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("ls");
        return next;
      },
      { replace: true },
    );
  }, [liveSearchId, liveRow, setSearchParams]);

  // Reactive row-watcher. Whenever the in-flight `liveSearches` row
  // patches (status flip, results landed, highlight batch finished, AI
  // answer ready), Convex re-fires `useQuery` and we end up here.
  // We copy the relevant fields into the existing `live*` state slots
  // so the rest of the page (results list, AI answer pane, expansion
  // chips) keeps reading from the same shape it always has.
  useEffect(() => {
    if (!liveRow) return;
    if (liveRow.resultsJson) {
      try {
        const parsed = JSON.parse(liveRow.resultsJson) as Array<{
          chunk: SearchResult["chunk"];
          score: number;
          rerank_score: number | null;
        }>;
        setLiveResults(parsed as unknown as SearchResult[]);
      } catch (e) {
        console.warn("liveSearches: failed to parse resultsJson", e);
      }
    }
    if (liveRow.expansions) {
      setLiveExpansions(liveRow.expansions);
    }
    if (liveRow.aiAnswer != null) {
      setLiveAiAnswer(liveRow.aiAnswer);
    }
    if (liveRow.status === "done") {
      setIsLiveLoading(false);
    } else if (liveRow.status === "error") {
      setIsLiveLoading(false);
      console.error("liveSearches row errored:", liveRow.errorMessage);
      captureError(
        new Error(liveRow.errorMessage ?? "search row error"),
        { where: "search.row", query },
      );
      toast.error(liveRow.errorMessage ?? "Search failed. Please try again.");
    } else {
      // Any non-terminal status keeps the loading indicator on, but
      // partial resultsJson is already in state so the page renders
      // what it has so far.
      setIsLiveLoading(true);
    }
  }, [liveRow, query]);

  // True when the user has actually typed a query. Without one we render an
  // empty hero state — never the MOCK_RESULTS fallback, which used to leak
  // demo "fake results" onto a freshly-opened /search page.
  const hasQuery = query.trim().length > 0;

  // Choose data source: live → cached → mock fixtures.
  // Mock fixtures only kick in when a query is present AND the backend is
  // unavailable, so an empty /search page never shows demo data.
  const allResults: SearchResult[] = hasQuery
    ? (liveResults ?? cachedResults ?? (BACKEND_ENABLED ? [] : MOCK_RESULTS))
    : [];
  const aiAnswer = liveAiAnswer ?? (hasQuery && !BACKEND_ENABLED ? MOCK_AI_ANSWER : null);
  const isLoading = isLiveLoading;

  // Filtering: when results came from the live action they were already
  // filtered server-side (FastAPI honored the language/category args),
  // so we skip the redundant client-side pass. For mock data we still
  // filter so the demo respects the toggle.
  const filteredResults = useMemo(() => {
    if (liveResults) return allResults;
    // Mock-data fallback. Each chunk has a free-form `collection` string;
    // map mock collections onto our category labels for the demo.
    return allResults.filter((r) => {
      if (language && r.chunk.language !== language) return false;
      if (category) {
        const c = r.chunk.collection ?? "";
        if (category === "risale" && c !== "Risale-i Nur") return false;
        if (category === "risale_dersleri" && c !== "Risale-i Nur Dersleri") return false;
        // pirlanta + hizmet aren't in the mock data — show nothing
        if (category === "pirlanta" || category === "hizmet") return false;
      }
      return true;
    });
  }, [allResults, language, category, liveResults]);

  // Log to history when query changes.
  //
  // - Live backend: the search action writes the canonical row to Convex.
  //   We skip the local cache write entirely; the sidebar reads from
  //   `useQuery(api.queries.searchHistory.list)` and updates reactively.
  // - Demo / unauthenticated: write to the local provider so the sidebar
  //   still works without a backend.
  useEffect(() => {
    if (!query.trim()) return;
    if (BACKEND_ENABLED) return; // server-side write happens in actions/search
    const key = `${query}::${language ?? ""}::${category ?? ""}::${mode}`;
    if (lastLoggedQueryRef.current === key) return;
    lastLoggedQueryRef.current = key;

    const id = addHistory({
      query,
      language,
      category,
      mode,
      resultCount: filteredResults.length,
      cachedResults: filteredResults,
      cachedAiAnswer: mode === "ai" ? (aiAnswer ?? undefined) : undefined,
    });
    setActiveHistoryId(id);
  }, [query, language, category, mode, filteredResults, addHistory, aiAnswer]);

  const handleSelectHistory = (entry: SearchHistoryEntry) => {
    setActiveHistoryId(entry.id);
    setMode(entry.mode);
    setLanguage(entry.language);
    setCategory(entry.category);
    if (entry.isStale) setShowStaleNotice(true);
    setSidebarOpen(false);

    // Restore the cached payload IMMEDIATELY and seed the fetch-key
    // ref so the URL change below doesn't trigger a fresh search.
    // Without this seeding, the useEffect would see a "new" query
    // and refetch even though we already have the data on hand.
    const hasCache =
      Array.isArray(entry.cachedResults) && entry.cachedResults.length > 0;
    if (hasCache) {
      setLiveResults(entry.cachedResults);
      setLiveAiAnswer(entry.cachedAiAnswer ?? null);
      setLiveExpansions(entry.cachedExpansions ?? []);
      setIsLiveLoading(false);
      lastFetchKeyRef.current = `${entry.query}::${entry.language ?? ""}::${entry.category ?? ""}`;
    } else {
      // No cache (older history row written before caching shipped) —
      // fall through to a fresh fetch via the useEffect.
      setCachedResults(entry.cachedResults);
    }

    // Update URL via React Router so SearchBar re-syncs.
    const params = new URLSearchParams();
    params.set("q", entry.query);
    if (entry.mode === "ai") params.set("mode", "ai");
    // Prevent the useEffect from re-adding to history for this specific navigation
    lastLoggedQueryRef.current = `${entry.query}::${entry.language ?? ""}::${entry.category ?? ""}::${entry.mode}`;
    navigate(`/search?${params.toString()}`, { replace: true });
  };

  // j/k keyboard navigation across results
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(filteredResults.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredResults.length]);

  // Reset selection on query / filter change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, language, category, mode]);

  const selectedResult = filteredResults[selectedIndex];

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
    <div className="flex min-h-0 flex-1 overflow-hidden relative">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute bottom-20 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-lg border border-border md:hidden"
        title={t("history.toggle")}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "absolute md:relative inset-y-0 left-0 z-30 transform transition-transform md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SearchHistorySidebar
          activeId={activeHistoryId}
          onSelect={handleSelectHistory}
          onRerun={handleRerun}
        />
      </div>

      {/* Main content. Restructured into a sticky header (search bar +
          controls) on top and an independently-scrolling results column
          below. This means scrolling the results does NOT push the
          search bar, history sidebar, or right preview panel out of
          view — only the middle results column moves. */}
      <div className="flex flex-1 min-w-0 min-h-0 flex-col">
        {!hasQuery ? (
          /* Empty hero — landed on /search without a query. */
          <div className="flex h-full items-center justify-center px-4 py-12">
            <div className="w-full max-w-2xl text-center">
              <h1
                className="text-2xl font-semibold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Search the corpus
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask a question, look up a concept, or explore a passage.
              </p>
              <div className="mt-6">
                <SearchBar initialQuery="" autoFocus large />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Sticky header — search bar + stale notice + controls. */}
            <div className="shrink-0 border-b border-border/40 bg-background/95 backdrop-blur-sm">
              <div className="mx-auto max-w-4xl px-4 pt-6 pb-3">
                <div className="mb-4">
                  <SearchBar initialQuery={query} />
                </div>

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

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <SearchToggle mode={mode} onChange={setMode} />
                  <FilterPanel
                    language={language}
                    category={category}
                    onLanguageChange={setLanguage}
                    onCategoryChange={setCategory}
                    resultCount={filteredResults.length}
                    retrievalTimeMs={142}
                  />
                </div>
              </div>
            </div>

            {/* Scrollable results column. */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="mx-auto max-w-4xl px-4 py-6">
                {/* Loading spinner — only when we have NO results yet.
                    Once the first milestone (ranked) lands, the spinner
                    disappears and the cards render with their own
                    progressive enrichment (highlights arrive seconds
                    later via the reactive useQuery subscription). */}
                {(isLoading || isRerunning) && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">
                      {t("search.searching")}
                    </span>
                  </div>
                )}

                {!isLoading && !isRerunning && (
                  <div className="space-y-4">
                    {/* Deep research entry point — sits next to the AI
                        answer area but never touches the instant answer
                        itself. Live backend only (the mock demo has no
                        agentic pipeline to run). */}
                    {BACKEND_ENABLED && (
                      <DeepResearchButton query={query} />
                    )}
                    {mode === "ai" && aiAnswer && (
                      <AIAnswer
                        answer={aiAnswer}
                        sources={filteredResults}
                        query={query}
                        model="gemini"
                      />
                    )}
                    {liveExpansions.length > 0 && (
                      <div className="rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                          AI also searched
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {liveExpansions.map((q) => (
                            <span
                              key={q}
                              className="rounded-full border border-primary/20 bg-card/80 px-2.5 py-0.5 text-[11px] text-foreground/80"
                              title="An AI-suggested rephrasing of your query that the search merged into these results"
                            >
                              {q}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <ResultsList
                      results={filteredResults}
                      query={query}
                      expandedQueries={liveExpansions}
                      filterLanguage={language ?? undefined}
                      filterCategory={category ?? undefined}
                      selectedIndex={selectedIndex}
                      onSelect={setSelectedIndex}
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right preview panel — only on ≥xl screens */}
      {previewOpen && (
        <aside
          className="hidden xl:flex relative shrink-0 flex-col border-l border-border bg-card/40 overflow-hidden"
          style={{ width: previewWidth }}
        >
          {/* Resize handle — sits on the panel's left edge. */}
          <div
            onMouseDown={startResize}
            className="absolute left-0 top-0 z-20 h-full w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent hover:bg-primary/30 transition-colors"
            title="Drag to resize"
          />
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Preview
              <span className="hidden 2xl:inline normal-case tracking-normal text-[10px] opacity-70">
                (j/k to navigate)
              </span>
            </div>
            <button
              onClick={() => setPreviewOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Close preview"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {selectedResult ? (
              <PreviewPanel result={selectedResult} />
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Select a result to preview
              </p>
            )}
          </div>
        </aside>
      )}
      {!previewOpen && (
        <button
          onClick={() => setPreviewOpen(true)}
          className="hidden xl:flex absolute top-4 right-4 z-10 items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Preview
        </button>
      )}
    </div>
  );
}

function PreviewPanel({
  result,
}: {
  result: { chunk: import("@/lib/types").ChunkResult };
}) {
  const { chunk } = result;
  const isArabic = detectArabicScript(chunk.parent_text ?? chunk.text);
  // Prefer the LLM-highlighted version of the chunk when present. The
  // server-side highlight pass wraps query-relevant spans in **bold**;
  // we render those as a real `<strong>` so the user can see at a glance
  // which part of the chunk matched.
  const highlighted = chunk.highlighted_text ?? null;
  const passage = chunk.parent_text ?? chunk.text;
  // We scroll the first highlighted span into view when the selection
  // changes. The ref is on the scroll container; the marker is on the
  // first <strong>.
  const containerRef = useRef<HTMLDivElement>(null);
  const firstStrongRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    // Reset to top first so non-highlighted previews don't carry over
    // a previous scroll position.
    if (containerRef.current) containerRef.current.scrollTop = 0;
    // Then jump to the first highlight span if any.
    if (firstStrongRef.current && containerRef.current) {
      const c = containerRef.current;
      const el = firstStrongRef.current;
      // Center the highlight in the visible area without scrolling the
      // entire page (scrollIntoView would scroll our parent flex column).
      const cRect = c.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const offset = eRect.top - cRect.top - cRect.height / 2 + eRect.height / 2;
      c.scrollTop = Math.max(0, c.scrollTop + offset);
    }
  }, [chunk.chunk_id]);

  return (
    <div className="space-y-3">
      <div>
        <h3
          className="text-sm font-semibold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {chunk.title}
        </h3>
        {chunk.author_speaker && (
          <p
            className="mt-0.5 text-[11px] text-muted-foreground"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            {chunk.author_speaker}
          </p>
        )}
      </div>
      <SourceContextPanel
        docId={chunk.doc_id}
        chunkText={chunk.text}
        passageStart={chunk.passage_start ?? undefined}
        className="max-h-[62vh]"
        placeholder={
          <div
            ref={containerRef}
            dir={isArabic ? "rtl" : "ltr"}
            className={cn(
              "max-h-[55vh] overflow-y-auto rounded-lg border border-border/60 bg-background/50 p-3 text-[13px] leading-relaxed text-foreground/85",
              isArabic && "font-[var(--font-arabic)] text-base"
            )}
          >
            {highlighted
              ? renderInlineBold(highlighted, firstStrongRef)
              : passage}
          </div>
        }
      />
      <a
        href={buildSourceViewerUrl(chunk)}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1 text-[11px] text-primary no-underline hover:underline"
      >
        Open in viewer
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

/**
 * Tiny inline-Markdown renderer for the **bold** spans the LLM
 * highlight pass produces. Reuses the same `**...**` shape as
 * ResultCard's renderHighlightedMarkdown but threads a ref onto
 * the FIRST <strong> so the parent can scroll it into view.
 */
function renderInlineBold(
  text: string,
  firstStrongRef: React.RefObject<HTMLElement | null>,
): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  let strongSeen = 0;
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) {
      const isFirst = strongSeen === 0;
      strongSeen += 1;
      return (
        <strong
          key={i}
          ref={isFirst ? firstStrongRef : undefined}
          className="rounded bg-primary/15 px-0.5 font-semibold text-foreground"
        >
          {m[1]}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
