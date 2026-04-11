import { motion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Compass, Shield, Lock, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIModel } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { spring } from "@/lib/motion";
import {
  variantsForFamily,
  defaultVariantId,
  type ModelVariant,
} from "../../../../convex/lib/modelCatalog";

interface ModelSelectorProps {
  model: AIModel;
  variantId: string;
  onChange: (model: AIModel, variantId: string) => void;
  claudeLocked?: boolean;
}

/**
 * Two-tier model selector:
 *   1. Family toggle: Gemini · Exploration ↔ Claude · Precision
 *   2. Variant dropdown: pick the specific model within the active family
 *
 * The family toggle uses a Framer Motion `layoutId` so the active background
 * pill slides smoothly across when the user toggles. The variant dropdown
 * is a Radix popover triggered by a small chevron button next to the toggle.
 */
export function ModelSelector({
  model,
  variantId,
  onChange,
  claudeLocked = false,
}: ModelSelectorProps) {
  const { t } = useTranslation();

  const handleFamilyChange = (newFamily: AIModel) => {
    if (newFamily === model) return;
    // Switching family resets the variant to that family's default.
    onChange(newFamily, defaultVariantId(newFamily));
  };

  const handleVariantPick = (v: ModelVariant) => {
    onChange(v.family, v.id);
  };

  const activeVariants = variantsForFamily(model);
  const activeVariant =
    activeVariants.find((v) => v.id === variantId) ?? activeVariants[0];

  return (
    <div className="flex items-center gap-1.5">
      {/* Family toggle */}
      <div
        className="relative inline-flex items-center rounded-xl border border-border bg-muted/40 p-1"
        role="tablist"
        aria-label="Choose AI model family"
      >
        <ModelButton
          active={model === "gemini"}
          onClick={() => handleFamilyChange("gemini")}
          icon={<Compass className="h-3.5 w-3.5" />}
          name={t("chat.modelGemini")}
          mode={t("chat.modeExploration")}
          color="blue"
        />
        <ModelButton
          active={model === "claude"}
          onClick={() => handleFamilyChange("claude")}
          icon={
            claudeLocked ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Shield className="h-3.5 w-3.5" />
            )
          }
          name={t("chat.modelClaude")}
          mode={t("chat.modePrecision")}
          color="amber"
          disabled={claudeLocked}
        />
      </div>

      {/* Variant dropdown */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors sm:max-w-[180px]"
            title="Choose model variant"
            aria-label="Choose model variant"
          >
            <span className="hidden truncate sm:inline">{activeVariant.label}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[240px] overflow-hidden rounded-lg border border-border bg-card p-1 shadow-[var(--shadow-lg)]"
          >
            <DropdownMenu.Label className="px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {model === "claude" ? "Claude variants" : "Gemini variants"}
            </DropdownMenu.Label>
            {activeVariants.map((v) => (
              <DropdownMenu.Item
                key={v.id}
                onSelect={() => handleVariantPick(v)}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[12px] outline-none transition-colors hover:bg-muted focus:bg-muted",
                  v.id === variantId && "bg-muted/60"
                )}
              >
                <Check
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    v.id === variantId
                      ? "text-primary opacity-100"
                      : "opacity-0"
                  )}
                />
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{v.label}</div>
                  {v.subtitle && (
                    <div className="text-[10px] text-muted-foreground">
                      {v.subtitle}
                    </div>
                  )}
                </div>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function ModelButton({
  active,
  onClick,
  icon,
  name,
  mode,
  color,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  name: string;
  mode: string;
  color: "blue" | "amber";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative z-10 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5",
        active
          ? color === "blue"
            ? "text-blue-600 dark:text-blue-300"
            : "text-amber-700 dark:text-amber-300"
          : "text-muted-foreground hover:text-foreground",
        disabled && !active && "opacity-70"
      )}
    >
      {/* Sliding active background via layoutId */}
      {active && (
        <motion.div
          layoutId="model-selector-active"
          transition={spring.snappy}
          className={cn(
            "absolute inset-0 -z-10 rounded-lg border shadow-[var(--shadow-xs)]",
            color === "blue"
              ? "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900"
              : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900"
          )}
        />
      )}
      {icon}
      <span>{name}</span>
      <span
        className="hidden sm:inline text-[10px] opacity-70"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
      >
        {mode}
      </span>
    </button>
  );
}
