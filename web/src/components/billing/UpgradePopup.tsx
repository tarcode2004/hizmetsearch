import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  X,
  Sparkles,
  Crown,
  Key,
  Shield,
  Check,
  UserPlus,
  Zap,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthProvider";

export type UpgradeReason =
  | "anon-claude-locked"
  | "anon-tokens-exhausted"
  | "free-to-pro"
  | "pro-to-scholar"
  | "free-claude-exhausted"
  | "pro-claude-exhausted";

interface UpgradePopupProps {
  open: boolean;
  reason: UpgradeReason;
  onClose: () => void;
}

export function UpgradePopup({ open, reason, onClose }: UpgradePopupProps) {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const navigate = useNavigate();

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const isAnon = reason === "anon-claude-locked" || reason === "anon-tokens-exhausted";

  // Compute UI strings per reason
  const config = {
    "anon-claude-locked": {
      icon: Shield,
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: "text-amber-600 dark:text-amber-400",
      title: t("upgrade.anonClaude.title"),
      desc: t("upgrade.anonClaude.desc"),
    },
    "anon-tokens-exhausted": {
      icon: Zap,
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: "text-amber-600 dark:text-amber-400",
      title: t("upgrade.anonExhausted.title"),
      desc: t("upgrade.anonExhausted.desc"),
    },
    "free-to-pro": {
      icon: Sparkles,
      iconBg: "bg-primary/10 dark:bg-primary/20",
      iconColor: "text-primary",
      title: t("upgrade.freeToPro.title"),
      desc: t("upgrade.freeToPro.desc"),
    },
    "free-claude-exhausted": {
      icon: Sparkles,
      iconBg: "bg-primary/10 dark:bg-primary/20",
      iconColor: "text-primary",
      title: t("upgrade.freeToPro.title"),
      desc: t("upgrade.freeToPro.desc"),
    },
    "pro-to-scholar": {
      icon: Crown,
      iconBg: "bg-accent/20 dark:bg-accent/30",
      iconColor: "text-accent",
      title: t("upgrade.proToScholar.title"),
      desc: t("upgrade.proToScholar.desc"),
    },
    "pro-claude-exhausted": {
      icon: Crown,
      iconBg: "bg-accent/20 dark:bg-accent/30",
      iconColor: "text-accent",
      title: t("upgrade.proToScholar.title"),
      desc: t("upgrade.proToScholar.desc"),
    },
  }[reason];

  const Icon = config.icon;

  const handleSignUp = () => {
    // Demo: instant sign-in. Real impl: route to /auth
    signIn("demo@hizmetsearch.com", "Demo User");
    onClose();
  };

  const handleUpgrade = () => {
    navigate("/pricing");
    onClose();
  };

  const handleByok = () => {
    navigate("/settings");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center">
          <div
            className={cn(
              "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
              config.iconBg
            )}
          >
            <Icon className={cn("h-7 w-7", config.iconColor)} />
          </div>

          <h2 className="text-lg font-bold text-foreground">{config.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{config.desc}</p>
        </div>

        {/* Benefits list (only for anon scenarios) */}
        {isAnon && (
          <div className="mt-5 rounded-xl border border-border bg-muted/40 p-3.5">
            <p className="text-xs font-semibold text-foreground mb-2">
              {t("upgrade.benefits.title")}
            </p>
            <ul className="space-y-1.5">
              <BenefitItem text={t("upgrade.benefits.tokens")} />
              <BenefitItem text={t("upgrade.benefits.history")} />
              <BenefitItem text={t("upgrade.benefits.byok")} />
              <BenefitItem text={t("upgrade.benefits.feedback")} />
            </ul>
          </div>
        )}

        {/* CTAs */}
        <div className="mt-6 space-y-2">
          {isAnon ? (
            <>
              <button
                onClick={handleSignUp}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                {t("upgrade.cta.signUp")}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <Link
                to="/pricing"
                onClick={onClose}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground no-underline hover:bg-muted transition-colors"
              >
                {t("pricing.title")}
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={handleUpgrade}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Crown className="h-4 w-4" />
                {t("upgrade.cta.upgrade")}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleByok}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Key className="h-4 w-4" />
                {t("upgrade.cta.byok")}
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("upgrade.cta.maybeLater")}
          </button>
        </div>
      </div>
    </div>
  );
}

function BenefitItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-xs text-foreground/80">
      <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
      <span>{text}</span>
    </li>
  );
}
