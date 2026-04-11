/**
 * Subtle dismissible sign-in banner shown to anonymous visitors on the
 * main app routes (home, search, chat). Persists "dismissed" in localStorage
 * so we don't nag.
 */
import { useEffect, useState } from "react";
import { LogIn, X, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTranslation } from "@/lib/i18n/I18nProvider";

const STORAGE_KEY = "hizmetsearch.banner.dismissed";

export function AnonymousBanner() {
  const { user, signIn } = useAuth();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(true);

  // Read dismissal flag once on mount (avoids SSR hydration mismatch)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (user.isAuthenticated || dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="border-b border-border bg-card/40 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{t("banner.anonymous")}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => signIn()}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <LogIn className="h-3 w-3" />
            {t("common.signIn")}
          </button>
          <button
            onClick={handleDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={t("banner.dismiss")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
