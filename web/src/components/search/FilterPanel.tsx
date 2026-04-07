import { Globe, Library } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGUAGE_LABELS } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface FilterPanelProps {
  language: string | null;
  collection: string | null;
  onLanguageChange: (lang: string | null) => void;
  onCollectionChange: (col: string | null) => void;
  resultCount: number;
  retrievalTimeMs: number;
}

const LANGUAGES = ["tr", "ar", "en", "ota"];
const COLLECTIONS = ["Risale-i Nur", "Hizmet", "Tefsir", "Hadis"];

export function FilterPanel({
  language,
  collection,
  onLanguageChange,
  onCollectionChange,
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

      {/* Collection filter */}
      <div className="flex items-center gap-1.5">
        <Library className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex gap-1">
          <FilterChip
            label={t("search.filterAll")}
            active={collection === null}
            onClick={() => onCollectionChange(null)}
          />
          {COLLECTIONS.map((c) => (
            <FilterChip
              key={c}
              label={c}
              active={collection === c}
              onClick={() => onCollectionChange(collection === c ? null : c)}
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
