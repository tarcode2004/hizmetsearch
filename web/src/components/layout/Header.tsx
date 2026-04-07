import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Search,
  MessageSquare,
  BookOpenText,
  Settings,
  Sun,
  Moon,
  Languages,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UsageBanner } from "@/components/billing/UsageBanner";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { useAuth, useUsagePercent } from "@/lib/auth/AuthProvider";
import { useState } from "react";

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, locale, setLocale } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { claudePct, geminiPct } = useUsagePercent();
  const [menuOpen, setMenuOpen] = useState(false);

  const isHome = location.pathname === "/";
  const isExceeded =
    user.claudeTokensUsed >= user.claudeTokensLimit &&
    user.geminiTokensUsed >= user.geminiTokensLimit;

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const toggleLocale = () => {
    setLocale(locale === "tr" ? "en" : "tr");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-4">
        {/* Logo */}
        <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <BookOpenText className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="hidden text-lg font-semibold text-foreground sm:inline">
            HizmetSearch
          </span>
        </Link>

        {/* Search shortcut (desktop only, not on home) */}
        {!isHome && (
          <div className="hidden flex-1 max-w-md md:block">
            <button
              onClick={() => navigate("/")}
              className="flex w-full items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span>{t("nav.searchPlaceholder")}</span>
              <kbd className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                ⌘K
              </kbd>
            </button>
          </div>
        )}

        <nav className="flex items-center gap-1">
          <NavLink
            to="/"
            icon={Search}
            label={t("nav.search")}
            active={isHome || location.pathname === "/search"}
          />
          <NavLink
            to="/chat"
            icon={MessageSquare}
            label={t("nav.chat")}
            active={location.pathname.startsWith("/chat")}
          />

          {/* Usage banner */}
          <div className="ml-1 hidden sm:block">
            <UsageBanner
              claudeTokensUsed={user.claudeTokensUsed}
              claudeTokensLimit={user.claudeTokensLimit}
              claudePercentUsed={claudePct}
              geminiTokensUsed={user.geminiTokensUsed}
              geminiTokensLimit={user.geminiTokensLimit}
              geminiPercentUsed={geminiPct}
              isExceeded={isExceeded}
              byokActive={user.byokActive}
            />
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          {/* Language toggle */}
          <button
            onClick={toggleLocale}
            className="hidden h-8 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:flex"
            title="Toggle language"
          >
            <Languages className="h-3.5 w-3.5" />
            {locale.toUpperCase()}
          </button>

          {/* User menu */}
          <div className="relative">
            {user.isAuthenticated ? (
              <>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  <User className="h-4 w-4 text-primary" />
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 top-10 w-48 rounded-xl border border-border bg-card shadow-lg py-1 z-50"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <div className="px-3 py-2 border-b border-border">
                      <div className="text-xs font-medium text-foreground">
                        {user.name ?? user.email}
                      </div>
                      <div className="text-[10px] text-muted-foreground capitalize">
                        {user.plan} plan
                      </div>
                    </div>
                    <Link
                      to="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-foreground no-underline hover:bg-muted"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      {t("settings.title")}
                    </Link>
                    <button
                      onClick={() => {
                        signOut();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      {t("common.signOut")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => navigate("/pricing")}
                className="flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("common.signIn")}</span>
              </button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string;
  icon: typeof Search;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium no-underline transition-colors sm:px-3",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
