import { List, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchMode } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface SearchToggleProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}

export function SearchToggle({ mode, onChange }: SearchToggleProps) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
      <ToggleButton
        active={mode === "results"}
        onClick={() => onChange("results")}
        icon={List}
        label={t("search.modeResults")}
      />
      <ToggleButton
        active={mode === "ai"}
        onClick={() => onChange("ai")}
        icon={Sparkles}
        label={t("search.modeAi")}
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof List;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
