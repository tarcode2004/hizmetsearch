import { Check, Sparkles, Crown, Zap, Shield, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, VISIBLE_PLANS, formatTokens, type Plan } from "@/lib/billing";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface PricingCardsProps {
  currentPlan?: Plan;
  onSelectPlan: (plan: Plan) => void;
}

const PLAN_ICONS: Record<Plan, typeof Zap> = {
  anonymous: Zap,
  free: Zap,
  pro: Sparkles,
  scholar: Crown,
};

export function PricingCards({ currentPlan = "free", onSelectPlan }: PricingCardsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {VISIBLE_PLANS.map((key) => {
        const plan = PLANS[key];
        const Icon = PLAN_ICONS[key];
        const isCurrent = currentPlan === key;

        return (
          <div
            key={key}
            className={cn(
              "relative flex flex-col rounded-2xl border p-6 transition-all",
              plan.highlight
                ? "border-primary bg-gradient-to-b from-primary/5 to-transparent shadow-lg scale-[1.02]"
                : "border-border bg-card hover:border-primary/30 hover:shadow-md"
            )}
          >
            {plan.badgeKey && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  plan.highlight
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-accent-foreground"
                )}>
                  {t(plan.badgeKey)}
                </span>
              </div>
            )}

            {/* Header */}
            <div className="mb-4 text-center">
              <div className={cn(
                "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl",
                key === "free" ? "bg-muted" :
                key === "pro" ? "bg-primary/10" :
                "bg-accent/20"
              )}>
                <Icon className={cn(
                  "h-6 w-6",
                  key === "free" ? "text-muted-foreground" :
                  key === "pro" ? "text-primary" :
                  "text-accent"
                )} />
              </div>
              <h3 className="text-lg font-bold text-foreground">{t(plan.nameKey)}</h3>
              <div className="mt-2 flex items-baseline justify-center gap-1">
                <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                {plan.priceMonthly > 0 && (
                  <span className="text-sm text-muted-foreground">/{t("settings.perMonth")}</span>
                )}
              </div>

              {/* Per-model token allotments */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-amber-50 px-2 py-1.5 border border-amber-100">
                  <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-amber-700">
                    <Shield className="h-2.5 w-2.5" />
                    Claude
                  </div>
                  <div className="text-sm font-bold text-amber-900">
                    {formatTokens(plan.claudeTokens)}
                  </div>
                </div>
                <div className="rounded-lg bg-blue-50 px-2 py-1.5 border border-blue-100">
                  <div className="flex items-center justify-center gap-1 text-[10px] font-medium text-blue-700">
                    <Compass className="h-2.5 w-2.5" />
                    Gemini
                  </div>
                  <div className="text-sm font-bold text-blue-900">
                    {formatTokens(plan.geminiTokens)}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {t("pricing.tokensPerMonth")}
              </p>
            </div>

            {/* Features */}
            <ul className="mb-6 flex-1 space-y-2.5">
              {plan.featureKeys.map((featureKey) => (
                <li key={featureKey} className="flex items-start gap-2 text-sm">
                  <Check className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    plan.highlight ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className="text-foreground/80">{t(featureKey)}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <button
              onClick={() => onSelectPlan(key)}
              disabled={isCurrent}
              className={cn(
                "w-full rounded-xl py-2.5 text-sm font-semibold transition-all",
                isCurrent
                  ? "cursor-default border border-border bg-muted text-muted-foreground"
                  : plan.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                    : "border border-border bg-card text-foreground hover:bg-muted"
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
