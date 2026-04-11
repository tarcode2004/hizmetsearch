import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { SearchResult } from "@/lib/types";

export interface SearchHistoryEntry {
  id: string;
  query: string;
  language: string | null;
  category: string | null;
  mode: "results" | "ai";
  resultCount: number;
  cachedResults: SearchResult[];
  cachedAiAnswer?: string;
  /** AI-expanded query phrasings the search ran. Restored alongside
   *  results when reopening a history entry so the "AI also searched"
   *  chip row matches what the user originally saw. */
  cachedExpansions?: string[];
  createdAt: number;
  // Marks if results are stale (older than X days)
  isStale?: boolean;
}

interface SearchHistoryContext {
  history: SearchHistoryEntry[];
  add: (entry: Omit<SearchHistoryEntry, "id" | "createdAt">) => string;
  get: (id: string) => SearchHistoryEntry | undefined;
  remove: (id: string) => void;
  clear: () => void;
  // Marks an entry as having been re-run (refreshes cache)
  refresh: (id: string, results: SearchResult[]) => void;
}

const Ctx = createContext<SearchHistoryContext | null>(null);

const STORAGE_KEY = "hizmetsearch.search_history";
const MAX_ENTRIES = 50;
const STALE_AFTER_DAYS = 7;

function loadHistory(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: SearchHistoryEntry[] = JSON.parse(stored);
    // Mark stale entries
    const staleThreshold = Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
    return parsed.map((e) => ({ ...e, isStale: e.createdAt < staleThreshold }));
  } catch {
    return [];
  }
}

function saveHistory(history: SearchHistoryEntry[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }
}

export function SearchHistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<SearchHistoryEntry[]>(loadHistory);

  // Persist on every change
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const add = (entry: Omit<SearchHistoryEntry, "id" | "createdAt">) => {
    // De-dupe: if same query+lang+category exists, update + bump to top
    const key = `${entry.query}::${entry.language ?? ""}::${entry.category ?? ""}`;
    const existing = history.find(
      (h) => `${h.query}::${h.language ?? ""}::${h.category ?? ""}` === key
    );

    if (existing) {
      // Update in place — don't reorder, since the user may just be revisiting
      // an existing entry from the sidebar.
      setHistory((prev) =>
        prev.map((h) =>
          h.id === existing.id ? { ...h, ...entry, isStale: false } : h
        )
      );
      return existing.id;
    }

    const id = `sh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newEntry: SearchHistoryEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
      isStale: false,
    };
    setHistory((prev) => [newEntry, ...prev].slice(0, MAX_ENTRIES));
    return id;
  };

  const get = (id: string) => history.find((h) => h.id === id);

  const remove = (id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  const clear = () => {
    setHistory([]);
  };

  const refresh = (id: string, results: SearchResult[]) => {
    setHistory((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              cachedResults: results,
              resultCount: results.length,
              createdAt: Date.now(),
              isStale: false,
            }
          : h
      )
    );
  };

  return (
    <Ctx.Provider value={{ history, add, get, remove, clear, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSearchHistory() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSearchHistory must be used within SearchHistoryProvider");
  return ctx;
}
