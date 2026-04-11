import { useState } from "react";
import {
  CreditCard,
  Key,
  Coffee,
  Heart,
  ExternalLink,
  Zap,
  Crown,
  Sparkles,
  Shield,
  Compass,
  Sun,
  Moon,
  Monitor,
  Languages,
  Settings as SettingsIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/api";
import { cn } from "@/lib/utils";
import { ApiKeyForm } from "@/components/billing/ApiKeyForm";
import { formatTokens, PLANS } from "@/lib/billing";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { useAuth, useUsagePercent } from "@/lib/auth/AuthProvider";
import { BACKEND_ENABLED } from "@/lib/env";
import { captureError } from "@/lib/observability";
import { trackByokKeyAdded, trackByokToggled } from "@/lib/analytics";
import { FeedbackForm } from "@/components/feedback/FeedbackForm";

type Tab = "plan" | "keys" | "preferences" | "support";

export function SettingsPage() {
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { claudePct, geminiPct } = useUsagePercent();
  const [activeTab, setActiveTab] = useState<Tab>("plan");

  // Live BYOK state from Convex (skipped in demo / unauthenticated mode)
  const liveUsage = useQuery(
    api.queries.usage.me,
    BACKEND_ENABLED && user.isAuthenticated ? {} : "skip"
  );
  const saveKeys = useMutation(api.mutations.apikeys.saveKeys);
  const removeKey = useMutation(api.mutations.apikeys.removeKey);
  const toggleByok = useMutation(api.mutations.apikeys.toggleByok);
  const createPortal = useAction(api.actions.stripe.createPortalSession);

  // True when the user has a Stripe customer record (i.e. they completed
  // at least one Checkout). Drives the "Manage subscription" button.
  const hasStripeCustomer = !!liveUsage?.stripeCustomerId;

  const handleManageSubscription = async () => {
    if (!BACKEND_ENABLED) {
      toast.message("Demo mode — billing portal disabled");
      return;
    }
    try {
      const { url } = await createPortal({
        returnUrl: `${window.location.origin}/settings`,
      });
      if (!url) throw new Error("Portal returned no URL");
      window.location.href = url;
    } catch (err) {
      console.error("createPortalSession failed", err);
      captureError(err, { where: "settings.manageSubscription" });
      toast.error(
        err instanceof Error
          ? `Could not open billing portal: ${err.message}`
          : "Could not open billing portal"
      );
    }
  };

  const handleSaveGemini = async (key: string) => {
    if (!BACKEND_ENABLED) {
      toast.message(t("byok.toast.demoMode"));
      return;
    }
    try {
      await saveKeys({ geminiKey: key });
      trackByokKeyAdded("gemini");
      toast.success(t("byok.toast.geminiSaved"));
    } catch (err) {
      captureError(err, { where: "settings.saveGemini" });
      toast.error(t("byok.toast.saveError"));
    }
  };
  const handleSaveClaude = async (key: string) => {
    if (!BACKEND_ENABLED) {
      toast.message(t("byok.toast.demoMode"));
      return;
    }
    try {
      await saveKeys({ claudeKey: key });
      trackByokKeyAdded("claude");
      toast.success(t("byok.toast.claudeSaved"));
    } catch (err) {
      captureError(err, { where: "settings.saveClaude" });
      toast.error(t("byok.toast.saveError"));
    }
  };
  const handleRemoveGemini = async () => {
    if (!BACKEND_ENABLED) return;
    try {
      await removeKey({ provider: "gemini" });
      toast.success(t("byok.toast.geminiRemoved"));
    } catch (err) {
      captureError(err, { where: "settings.removeGemini" });
    }
  };
  const handleRemoveClaude = async () => {
    if (!BACKEND_ENABLED) return;
    try {
      await removeKey({ provider: "claude" });
      toast.success(t("byok.toast.claudeRemoved"));
    } catch (err) {
      captureError(err, { where: "settings.removeClaude" });
    }
  };
  const handleToggleByok = async (active: boolean) => {
    if (!BACKEND_ENABLED) return;
    try {
      await toggleByok({ isActive: active });
      trackByokToggled(active);
    } catch (err) {
      captureError(err, { where: "settings.toggleByok" });
      toast.error(t("byok.toast.toggleError"));
    }
  };

  const planConfig = PLANS[user.plan];
  const resetMs = Date.now() + 22 * 24 * 60 * 60 * 1000;
  const daysUntilReset = Math.ceil(
    (resetMs - Date.now()) / (24 * 60 * 60 * 1000)
  );

  const tabs: { key: Tab; label: string; icon: typeof CreditCard }[] = [
    { key: "plan", label: t("settings.tabs.plan"), icon: CreditCard },
    { key: "keys", label: t("settings.tabs.keys"), icon: Key },
    { key: "preferences", label: t("settings.tabs.preferences"), icon: SettingsIcon },
    { key: "support", label: t("settings.tabs.support"), icon: Heart },
  ];

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:py-8">
      <h1
        className="text-3xl font-semibold text-foreground"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}
      >
        {t("settings.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>

      <div className="mt-6 flex min-w-0 flex-col gap-6 md:flex-row md:gap-8">
        {/* Left nav (~220px on desktop) */}
        <nav className="flex w-full min-w-0 shrink-0 flex-row gap-1 overflow-x-auto border-b border-border pb-2 md:w-[220px] md:flex-col md:overflow-visible md:border-b-0 md:pb-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors md:border-l-2",
                  isActive
                    ? "bg-primary/5 text-foreground md:border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60 md:border-transparent"
                )}
              >
                <tab.icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Main pane */}
        <div className="min-w-0 flex-1 max-w-2xl">
        {/* ─── Plan & Usage ─── */}
        {activeTab === "plan" && (
          <div className="space-y-6">
            {/* Current plan card */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg",
                      user.plan === "anonymous" || user.plan === "free"
                        ? "bg-muted"
                        : user.plan === "pro"
                          ? "bg-primary/10"
                          : "bg-accent/20"
                    )}
                  >
                    {user.plan === "pro" ? (
                      <Sparkles className="h-4 w-4 text-primary" />
                    ) : user.plan === "scholar" ? (
                      <Crown className="h-4 w-4 text-accent" />
                    ) : (
                      <Zap className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {t(planConfig.nameKey)} {t("settings.planSuffix")}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {planConfig.price}/{t("settings.perMonth")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {hasStripeCustomer && (
                    <button
                      onClick={handleManageSubscription}
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      title="Open Stripe Billing Portal"
                    >
                      Manage subscription
                    </button>
                  )}
                  <Link
                    to="/pricing"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground no-underline hover:bg-muted transition-colors"
                  >
                    {t("settings.viewPlans")}
                  </Link>
                </div>
              </div>

              {/* Per-model usage rings */}
              <div className="mt-6 grid grid-cols-2 gap-4">
                <LargeUsageRing
                  model="claude"
                  label={t("chat.modelClaude")}
                  percent={claudePct}
                  used={user.claudeTokensUsed}
                  limit={user.claudeTokensLimit}
                  locked={user.plan === "anonymous"}
                />
                <LargeUsageRing
                  model="gemini"
                  label={t("chat.modelGemini")}
                  percent={geminiPct}
                  used={user.geminiTokensUsed}
                  limit={user.geminiTokensLimit}
                />
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground text-right">
                {daysUntilReset} {t("settings.daysUntilReset")}
              </div>

              {/* BYOK shortcut */}
              {!user.byokActive && (
                <div className="mt-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5">
                  <p className="text-xs text-foreground/80">
                    <Key className="mr-1 inline h-3 w-3 text-primary" />
                    <strong>{t("settings.unlimitedUsage")}</strong>{" "}
                    <button
                      onClick={() => setActiveTab("keys")}
                      className="text-primary hover:underline font-medium"
                    >
                      {t("settings.addOwnKey")}
                    </button>{" "}
                    {t("settings.allLimitsRemoved")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── API Keys ─── */}
        {activeTab === "keys" && (
          <ApiKeyForm
            geminiKeySet={!!liveUsage?.geminiKeySet}
            claudeKeySet={!!liveUsage?.claudeKeySet}
            byokActive={!!liveUsage?.byokActive || user.byokActive}
            onSaveGemini={handleSaveGemini}
            onSaveClaude={handleSaveClaude}
            onRemoveGemini={handleRemoveGemini}
            onRemoveClaude={handleRemoveClaude}
            onToggleByok={handleToggleByok}
          />
        )}

        {/* ─── Preferences ─── */}
        {activeTab === "preferences" && (
          <div className="space-y-6">
            {/* Theme */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Sun className="h-4 w-4" />
                {t("settings.preferences.theme")}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <ThemeOption
                  active={theme === "light"}
                  onClick={() => setTheme("light")}
                  icon={Sun}
                  label={t("settings.preferences.themeLight")}
                />
                <ThemeOption
                  active={theme === "dark"}
                  onClick={() => setTheme("dark")}
                  icon={Moon}
                  label={t("settings.preferences.themeDark")}
                />
                <ThemeOption
                  active={theme === "system"}
                  onClick={() => setTheme("system")}
                  icon={Monitor}
                  label={t("settings.preferences.themeSystem")}
                />
              </div>
            </div>

            {/* Language */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Languages className="h-4 w-4" />
                {t("settings.preferences.language")}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setLocale("tr")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                    locale === "tr"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:bg-muted"
                  )}
                >
                  🇹🇷 {t("settings.preferences.languageTr")}
                </button>
                <button
                  onClick={() => setLocale("en")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                    locale === "en"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:bg-muted"
                  )}
                >
                  🇬🇧 {t("settings.preferences.languageEn")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Support ─── */}
        {activeTab === "support" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <Coffee className="h-7 w-7 text-amber-700 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {t("pricing.support.title")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("pricing.support.desc")}
              </p>
              <a
                href="https://buymeacoffee.com/hizmetsearch"
                target="_blank"
                rel="noopener"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-amber-600 transition-colors shadow-sm"
              >
                <Coffee className="h-5 w-5" />
                Buy Me a Coffee
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SupportLink
                href="https://github.com/hizmetsearch"
                icon={Heart}
                title="GitHub"
                desc="Source code & contributions"
                color="text-red-500"
              />
              <SupportLink
                href="mailto:destek@hizmetsearch.com"
                icon={ExternalLink}
                title="Contact"
                desc="destek@hizmetsearch.com"
                color="text-primary"
              />
            </div>

            <div>
              <h3
                className="mb-2 text-sm font-semibold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Send us feedback
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Bug reports, feature ideas, missing sources, content
                corrections — anything goes. Goes straight to our inbox.
              </p>
              <FeedbackForm bare />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function LargeUsageRing({
  model,
  label,
  percent,
  used,
  limit,
  locked = false,
}: {
  model: "claude" | "gemini";
  label: string;
  percent: number;
  used: number;
  limit: number;
  locked?: boolean;
}) {
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePct = locked ? 0 : Math.min(percent, 100);
  const dashOffset = circumference - (safePct / 100) * circumference;

  const color =
    percent >= 90
      ? "oklch(56% 0.22 27)"
      : percent >= 70
        ? "oklch(72% 0.17 70)"
        : model === "claude"
          ? "var(--color-gilt)"
          : "var(--color-primary)";

  const Icon = model === "claude" ? Shield : Compass;

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background/40 p-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            stroke="var(--color-border)"
            fill="none"
          />
          {!locked && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={strokeWidth}
              stroke={color}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div
            className="mt-0.5 text-xl font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {locked ? "—" : `${Math.round(safePct)}%`}
          </div>
        </div>
      </div>
      <div className="text-center">
        <div className="text-[11px] font-medium text-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {locked ? "Locked" : `${formatTokens(used)} / ${formatTokens(limit)}`}
        </div>
      </div>
    </div>
  );
}

function ThemeOption({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sun;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-all",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-foreground hover:bg-muted"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SupportLink({
  href,
  icon: Icon,
  title,
  desc,
  color,
}: {
  href: string;
  icon: typeof Heart;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 no-underline hover:border-primary/30 hover:shadow-sm transition-all"
    >
      <Icon className={cn("mt-0.5 h-5 w-5", color)} />
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </a>
  );
}
