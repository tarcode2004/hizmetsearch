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
import { cn } from "@/lib/utils";
import { ApiKeyForm } from "@/components/billing/ApiKeyForm";
import { formatTokens, PLANS } from "@/lib/billing";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useTheme, type Theme } from "@/lib/theme/ThemeProvider";
import { useAuth, useUsagePercent } from "@/lib/auth/AuthProvider";

type Tab = "plan" | "keys" | "preferences" | "support";

export function SettingsPage() {
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { claudePct, geminiPct } = useUsagePercent();
  const [activeTab, setActiveTab] = useState<Tab>("plan");

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
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-bold text-foreground">{t("settings.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>

      {/* Tabs - scrollable on mobile */}
      <div className="mt-6 flex gap-1 border-b border-border overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6">
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
                <Link
                  to="/pricing"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground no-underline hover:bg-muted transition-colors"
                >
                  {t("settings.viewPlans")}
                </Link>
              </div>

              {/* Per-model usage bars */}
              <div className="mt-5 space-y-4">
                {/* Claude */}
                <UsageBar
                  icon={Shield}
                  iconColor="text-amber-700 dark:text-amber-400"
                  label={`${t("chat.modelClaude")} (${t("chat.modePrecision")})`}
                  used={user.claudeTokensUsed}
                  limit={user.claudeTokensLimit}
                  percent={claudePct}
                  baseColor="bg-amber-400"
                  locked={user.plan === "anonymous"}
                  lockedMessage={t("upgrade.anonClaude.title")}
                />
                {/* Gemini */}
                <UsageBar
                  icon={Compass}
                  iconColor="text-blue-700 dark:text-blue-400"
                  label={`${t("chat.modelGemini")} (${t("chat.modeExploration")})`}
                  used={user.geminiTokensUsed}
                  limit={user.geminiTokensLimit}
                  percent={geminiPct}
                  baseColor="bg-blue-500"
                />
                <div className="text-[11px] text-muted-foreground text-right">
                  {daysUntilReset} {t("settings.daysUntilReset")}
                </div>
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
            geminiKeySet={false}
            claudeKeySet={false}
            byokActive={false}
            onSaveGemini={(key) => console.log("Save Gemini:", key.slice(0, 4) + "...")}
            onSaveClaude={(key) => console.log("Save Claude:", key.slice(0, 4) + "...")}
            onRemoveGemini={() => console.log("Remove Gemini")}
            onRemoveClaude={() => console.log("Remove Claude")}
            onToggleByok={(active) => console.log("BYOK:", active)}
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
          </div>
        )}
      </div>
    </div>
  );
}

function UsageBar({
  icon: Icon,
  iconColor,
  label,
  used,
  limit,
  percent,
  baseColor,
  locked = false,
  lockedMessage,
}: {
  icon: typeof Shield;
  iconColor: string;
  label: string;
  used: number;
  limit: number;
  percent: number;
  baseColor: string;
  locked?: boolean;
  lockedMessage?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className={cn("flex items-center gap-1.5 font-medium", iconColor)}>
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span className="font-medium text-foreground font-mono">
          {locked ? "🔒" : `${formatTokens(used)} / ${formatTokens(limit)}`}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 w-full rounded-full bg-muted">
        {!locked && (
          <div
            className={cn(
              "h-full rounded-full transition-all",
              percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : baseColor
            )}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        )}
      </div>
      {locked && lockedMessage && (
        <div className="mt-1 text-[10px] text-muted-foreground italic">
          {lockedMessage}
        </div>
      )}
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
