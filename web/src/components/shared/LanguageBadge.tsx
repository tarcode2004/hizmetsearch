import { cn } from "@/lib/utils";
import { LANGUAGE_LABELS } from "@/lib/constants";

const colorMap: Record<string, string> = {
  tr: "bg-red-50 text-red-700 border-red-200",
  ar: "bg-emerald-50 text-emerald-700 border-emerald-200",
  en: "bg-blue-50 text-blue-700 border-blue-200",
  "tr+ar": "bg-amber-50 text-amber-700 border-amber-200",
  ota: "bg-purple-50 text-purple-700 border-purple-200",
};

export function LanguageBadge({ language }: { language: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        colorMap[language] ?? "bg-muted text-muted-foreground border-border"
      )}
    >
      {LANGUAGE_LABELS[language] ?? language.toUpperCase()}
    </span>
  );
}
