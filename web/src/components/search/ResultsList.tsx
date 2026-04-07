import { ResultCard } from "./ResultCard";
import type { SearchResult } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface ResultsListProps {
  results: SearchResult[];
}

export function ResultsList({ results }: ResultsListProps) {
  const { t } = useTranslation();

  if (results.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">{t("search.noResults")}</p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          {t("search.noResultsHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {results.map((result, i) => (
        <ResultCard key={result.chunk.chunk_id} result={result} index={i} />
      ))}
    </div>
  );
}
