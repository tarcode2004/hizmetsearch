import { Globe, Library } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGUAGE_LABELS } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface FilterPanelProps {
  language: string | null;
  category: string | null;
  onLanguageChange: (lang: string | null) => void;
  onCategoryChange: (cat: string | null) => void;
  resultCount: number;
  retrievalTimeMs: number;
}

const LANGUAGES = ["tr", "ar", "en", "ota"];

// Each entry maps a category id (sent to the API) to a display label.
// The backend translates the id into a multi-criteria Qdrant filter — see
// `hizmetsearch/api/app/routes/search.py:CATEGORY_SPECS`.
const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "risale", label: "Risale" },
  { id: "risale_dersleri", label: "Risale Dersleri" },
  { id: "pirlanta", label: "Pırlanta" },
  { id: "hizmet", label: "Hizmet" },
];

export function FilterPanel({
  language,
  category,
  onLanguageChange,
  onCategoryChange,
  resultCount,
  retrievalTimeMs,
}: FilterPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-xs text-muted-foreground">
        {resultCount} {t("search.results")} ({retrievalTimeMs.toFixed(0)}ms)
      </span>

      <div className="h-4 w-px bg-border" />

      {/* Language filter */}
      <div className="flex items-center gap-1.5">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex gap-1">
          <FilterChip
            label={t("search.filterAll")}
            active={language === null}
            onClick={() => onLanguageChange(null)}
          />
          {LANGUAGES.map((l) => (
            <FilterChip
              key={l}
              label={LANGUAGE_LABELS[l] ?? l}
              active={language === l}
              onClick={() => onLanguageChange(language === l ? null : l)}
            />
          ))}
        </div>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Category filter */}
      <div className="flex items-center gap-1.5">
        <Library className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex gap-1">
          <FilterChip
            label={t("search.filterAll")}
            active={category === null}
            onClick={() => onCategoryChange(null)}
          />
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.id}
              label={c.label}
              active={category === c.id}
              onClick={() => onCategoryChange(category === c.id ? null : c.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
