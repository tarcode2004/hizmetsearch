import { ResultCard } from "./ResultCard";
import type { SearchResult } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface ResultsListProps {
  results: SearchResult[];
  query?: string;
  /** AI-expanded query phrasings the parent search ran. Forwarded to
   *  each card so feedback ratings can capture the full retrieval
   *  context as training data. */
  expandedQueries?: string[];
  filterLanguage?: string;
  filterCategory?: string;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}

export function ResultsList({
  results,
  query,
  expandedQueries,
  filterLanguage,
  filterCategory,
  selectedIndex,
  onSelect,
}: ResultsListProps) {
  const { t } = useTranslation();

  if (results.length === 0) {
    return (
      <div className="py-16 text-center">
        <p
          className="text-muted-foreground text-base"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          {t("search.noResults")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground/70">
          {t("search.noResultsHint")}
        </p>
      </div>
    );
  }

  // Plain div, NOT motion — each ResultCard owns its own enter
  // animation now (initial/animate props instead of variants
  // inheritance) so cards added in subsequent streaming patches
  // animate in independently rather than inheriting the parent's
  // already-finished "show" state.
  return (
    <div className="grid gap-3">
      {results.map((result, i) => (
        <ResultCard
          key={result.chunk.chunk_id}
          result={result}
          index={i}
          query={query}
          expandedQueries={expandedQueries}
          filterLanguage={filterLanguage}
          filterCategory={filterCategory}
          selected={selectedIndex === i}
          onSelect={onSelect ? () => onSelect(i) : undefined}
        />
      ))}
    </div>
  );
}
