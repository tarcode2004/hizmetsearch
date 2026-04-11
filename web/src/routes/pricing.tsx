import { PricingCards } from "@/components/billing/PricingCards";
import {
  Key,
  Coffee,
  Heart,
  Shield,
  Zap,
  Globe,
  Compass,
  Gauge,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/api";
import { CREDIT_PACKS, PAY_AS_YOU_GO, formatTokens, type Plan } from "@/lib/billing";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { BACKEND_ENABLED } from "@/lib/env";
import { captureError } from "@/lib/observability";
import {
  trackUpgradeClick,
  trackCheckoutStart,
  trackCreditPackClick,
} from "@/lib/analytics";

export function PricingPage() {
  const { t } = useTranslation();
  const { user, upgradeTo } = useAuth();
  const createCheckout = useAction(api.actions.stripe.createCheckoutSession);
  const createCreditPackCheckout = useAction(
    api.actions.stripe.createCreditPackCheckout
  );

  const handleSelectPlan = async (plan: Plan) => {
    if (plan === user.plan) return;
    if (plan === "free") {
      upgradeTo("free");
      return;
    }
    trackUpgradeClick(plan as "pro" | "scholar");
    if (BACKEND_ENABLED && user.isAuthenticated) {
      try {
        trackCheckoutStart(plan as "pro" | "scholar");
        console.log("[stripe] createCheckoutSession start", { plan });
        const result = await createCheckout({
          plan: plan as "pro" | "scholar",
          successUrl: `${window.location.origin}/settings?upgraded=${plan}`,
          cancelUrl: `${window.location.origin}/pricing`,
        });
        console.log("[stripe] createCheckoutSession returned", result);
        const url = result?.url;
        if (!url) {
          throw new Error("Checkout returned no URL");
        }
        // Sanity check: if Stripe gave us back our own success URL, that
        // means the action's dev fallback fired (silently). Surface it.
        if (url.startsWith(window.location.origin)) {
          throw new Error(
            `Checkout returned our own origin (${url}) — Stripe likely not configured`
          );
        }
        console.log("[stripe] redirecting to", url);
        window.location.href = url;
      } catch (err) {
        console.error("createCheckoutSession failed", err);
        captureError(err, { where: "pricing.upgrade", plan });
        toast.error(
          err instanceof Error
            ? `Checkout failed: ${err.message}`
            : "Checkout failed. Please try again."
        );
      }
      return;
    }
    // Demo / unauthenticated fallback
    upgradeTo(plan);
  };

  const handleBuyPack = async (packId: "spark" | "lantern" | "minaret") => {
    trackCreditPackClick(packId);
    if (BACKEND_ENABLED && user.isAuthenticated) {
      try {
        console.log("[stripe] createCreditPackCheckout start", { packId });
        const result = await createCreditPackCheckout({
          packId,
          successUrl: `${window.location.origin}/settings?pack=${packId}`,
          cancelUrl: `${window.location.origin}/pricing`,
        });
        console.log("[stripe] createCreditPackCheckout returned", result);
        const url = result?.url;
        if (!url) {
          throw new Error("Checkout returned no URL");
        }
        if (url.startsWith(window.location.origin)) {
          throw new Error(
            `Checkout returned our own origin (${url}) — Stripe likely not configured`
          );
        }
        console.log("[stripe] redirecting to", url);
        window.location.href = url;
      } catch (err) {
        console.error("createCreditPackCheckout failed", err);
        captureError(err, { where: "pricing.buyPack", packId });
        toast.error(
          err instanceof Error
            ? `Checkout failed: ${err.message}`
            : "Checkout failed. Please try again."
        );
      }
      return;
    }
    toast.message("Sign in to buy credits");
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

      {/* ─── Boost your plan: one-time credit packs ─── */}
      <section className="mt-14">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <div
              className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Top-ups
            </div>
            <h2
              className="mt-1 text-2xl font-semibold text-foreground"
              style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}
            >
              Boost your plan
            </h2>
            <p className="mt-1 max-w-[58ch] text-sm text-muted-foreground">
              One-time credit packs that stack on top of any plan&apos;s monthly
              allotment. Credits never expire.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.id}
              className={cn(
                "relative flex flex-col rounded-xl border border-border bg-card p-5 transition-all",
                "hover:border-primary/30 hover:shadow-[var(--shadow-sm)]"
              )}
            >
              {pack.badge && (
                <span
                  className="absolute right-4 top-4 rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--color-gilt-deep)",
                    border: "1px solid var(--color-gilt)",
                  }}
                >
                  {pack.badge}
                </span>
              )}
              <div
                className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Credit pack
              </div>
              <div
                className="mt-1 text-foreground"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 600,
                }}
              >
                {pack.name}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span
                  className="text-3xl font-semibold text-foreground"
                  style={{
                    fontFamily: "var(--font-display)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {pack.price}
                </span>
                <span className="text-xs text-muted-foreground">one-time</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Shield className="h-3 w-3" />
                    Claude
                  </div>
                  <div
                    className="mt-0.5 text-sm font-semibold text-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    +{formatTokens(pack.claudeTokens)}
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
                    +{formatTokens(pack.geminiTokens)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleBuyPack(pack.id as "spark" | "lantern" | "minaret")}
                className="mt-5 w-full rounded-lg border border-border bg-card py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                Add credits
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Pay-as-you-go ─── */}
      <section className="mt-10">
        <div className="rounded-xl border border-border bg-card p-6 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Gauge className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3
                  className="text-lg font-semibold text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Charge me as I go
                </h3>
                <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
                  Available on top of any paid plan. We meter overage and bill
                  you monthly — no overage caps, no surprise lock-outs.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Shield className="h-3 w-3" />
                    <span className="text-foreground/85">
                      ${PAY_AS_YOU_GO.claudePerMillion}
                    </span>
                    /M Claude tokens
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Compass className="h-3 w-3" />
                    <span className="text-foreground/85">
                      ${PAY_AS_YOU_GO.geminiPerMillion}
                    </span>
                    /M Gemini tokens
                  </span>
                </div>
              </div>
            </div>
            <Link
              to="/settings"
              className="shrink-0 rounded-xl border border-primary bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline hover:bg-primary/90 transition-colors"
            >
              Enable metered billing
            </Link>
          </div>
        </div>
      </section>

      {/* BYOK callout */}
      <div className="mt-10 rounded-xl border border-border bg-card p-6">
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

      {/* Support the Project */}
      <div className="mt-12 rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Coffee className="h-6 w-6 text-primary" />
        </div>
        <h3
          className="text-h2-serif text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Support the Project
        </h3>
        <p className="mx-auto mt-2 max-w-[52ch] text-sm text-muted-foreground">
          HizmetSearch is a community-supported project. If you find it
          valuable, consider buying us a coffee — it directly funds ingestion,
          hosting, and the API costs that keep the corpus alive.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://buymeacoffee.com/tarmus1291i?new=1"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground no-underline hover:bg-primary/90 transition-colors shadow-sm"
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
