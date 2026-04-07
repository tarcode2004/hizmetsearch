import { PricingCards } from "@/components/billing/PricingCards";
import { Key, Coffee, Heart, Shield, Zap, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import type { Plan } from "@/lib/billing";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthProvider";

export function PricingPage() {
  const { t } = useTranslation();
  const { user, upgradeTo } = useAuth();

  const handleSelectPlan = (plan: Plan) => {
    if (plan === user.plan) return;
    if (plan === "free") {
      upgradeTo("free");
      return;
    }
    // Demo: simulate Stripe checkout success
    upgradeTo(plan);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 text-center sm:mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("pricing.title")}
        </h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          {t("pricing.subtitle")}
        </p>
      </div>

      {/* Pricing cards */}
      <PricingCards currentPlan={user.plan} onSelectPlan={handleSelectPlan} />

      {/* BYOK callout */}
      <div className="mt-10 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 p-6">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Key className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-foreground">
              {t("pricing.byok.title")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("pricing.byok.desc")}
            </p>
          </div>
          <Link
            to="/settings"
            className="shrink-0 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline hover:bg-primary/90 transition-colors"
          >
            {t("pricing.byok.cta")}
          </Link>
        </div>
      </div>

      {/* Feature comparison */}
      <div className="mt-12">
        <h2 className="mb-6 text-center text-xl font-bold text-foreground">
          {t("pricing.allInclude")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={Zap}
            title={t("home.features.aiAnswers")}
            desc={t("home.features.aiAnswersDesc")}
          />
          <FeatureCard
            icon={Globe}
            title={t("home.features.multilingual")}
            desc={t("home.features.multilingualDesc")}
          />
          <FeatureCard
            icon={Shield}
            title={t("home.features.chat")}
            desc={t("home.features.chatDesc")}
          />
        </div>
      </div>

      {/* Buy Me a Coffee */}
      <div className="mt-12 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <Coffee className="h-6 w-6 text-amber-700 dark:text-amber-400" />
        </div>
        <h3 className="text-base font-bold text-foreground">
          {t("pricing.support.title")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pricing.support.desc")}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://buymeacoffee.com/hizmetsearch"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white no-underline hover:bg-amber-600 transition-colors shadow-sm"
          >
            <Coffee className="h-4 w-4" />
            Buy Me a Coffee
          </a>
          <a
            href="https://github.com/hizmetsearch"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground no-underline hover:bg-muted transition-colors"
          >
            <Heart className="h-4 w-4 text-red-500" />
            GitHub Star
          </a>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Zap;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
