import { Compass, Shield, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIModel } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface ModelSelectorProps {
  model: AIModel;
  onChange: (model: AIModel) => void;
  claudeLocked?: boolean;
}

export function ModelSelector({ model, onChange, claudeLocked = false }: ModelSelectorProps) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
      <button
        onClick={() => onChange("gemini")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all sm:px-3",
          model === "gemini"
            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm border border-blue-200 dark:border-blue-800"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Compass className="h-3.5 w-3.5" />
        <span>{t("chat.modelGemini")}</span>
        <span className="hidden sm:inline text-[10px] opacity-70">
          {t("chat.modeExploration")}
        </span>
      </button>
      <button
        onClick={() => onChange("claude")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all sm:px-3",
          model === "claude"
            ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 shadow-sm border border-amber-200 dark:border-amber-800"
            : "text-muted-foreground hover:text-foreground",
          claudeLocked && "opacity-80"
        )}
      >
        {claudeLocked ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <Shield className="h-3.5 w-3.5" />
        )}
        <span>{t("chat.modelClaude")}</span>
        <span className="hidden sm:inline text-[10px] opacity-70">
          {t("chat.modePrecision")}
        </span>
      </button>
    </div>
  );
}
