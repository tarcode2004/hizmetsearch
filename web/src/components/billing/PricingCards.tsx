import { Shield, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, VISIBLE_PLANS, formatTokens, type Plan } from "@/lib/billing";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface PricingCardsProps {
  currentPlan?: Plan;
  onSelectPlan: (plan: Plan) => void;
}

export function PricingCards({ currentPlan = "free", onSelectPlan }: PricingCardsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {VISIBLE_PLANS.map((key) => {
        const plan = PLANS[key];
        const isCurrent = currentPlan === key;

        return (
          <div
            key={key}
            className={cn(
              "relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-7 transition-all",
              "shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]"
            )}
          >
            {/* Gold-leaf left accent bar on highlighted/recommended tier */}
            {plan.highlight && (
              <div
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: "var(--color-gilt)" }}
              />
            )}

            {plan.badgeKey && (
              <div className="absolute right-4 top-4">
                <span
                  className="rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--color-gilt-deep)",
                    border: "1px solid var(--color-gilt)",
                  }}
                >
                  {t(plan.badgeKey)}
                </span>
              </div>
            )}

            {/* Tier name in caption-style small caps */}
            <div
              className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t(plan.nameKey)}
            </div>

            {/* Price — Fraunces display */}
            <div className="mt-2 flex items-baseline gap-1">
              <span
                className="text-4xl font-semibold text-foreground"
                style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
              >
                {plan.price}
              </span>
              {plan.priceMonthly > 0 && (
                <span className="text-xs text-muted-foreground">
                  /{t("settings.perMonth")}
                </span>
              )}
            </div>

            {/* Per-model token allotments */}
            <div className="mt-5 grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  Claude
                </div>
                <div
                  className="mt-0.5 text-sm font-semibold text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {formatTokens(plan.claudeTokens)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Compass className="h-3 w-3" />
                  Gemini
                </div>
                <div
                  className="mt-0.5 text-sm font-semibold text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {formatTokens(plan.geminiTokens)}
                </div>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("pricing.tokensPerMonth")}
            </p>

            {/* Features with thin dividers */}
            <ul className="mb-6 mt-5 flex-1">
              {plan.featureKeys.map((featureKey, i) => (
                <li
                  key={featureKey}
                  className={cn(
                    "py-2 text-[13px] text-foreground/80",
                    i > 0 && "border-t border-border/50"
                  )}
                >
                  {t(featureKey)}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <button
              onClick={() => onSelectPlan(key)}
              disabled={isCurrent}
              className={cn(
                "w-full rounded-lg border py-2.5 text-sm font-medium transition-all",
                isCurrent
                  ? "cursor-default border-border bg-muted text-muted-foreground"
                  : plan.highlight
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-border bg-card text-foreground hover:bg-muted"
              )}
            >
              {isCurrent ? t("plan.current") : t(plan.ctaKey)}
            </button>
          </div>
        );
      })}
    </div>
  );
}
