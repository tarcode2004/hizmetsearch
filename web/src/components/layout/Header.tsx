import { Link, useLocation } from "react-router-dom";
import {
  Search,
  MessageSquare,
  BookOpenText,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Languages,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { UsageRing } from "@/components/billing/UsageRing";
import { Kbd } from "@/components/ui/Kbd";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { useAuth, useUsagePercent } from "@/lib/auth/AuthProvider";
import { useEffect, useState } from "react";

export function Header() {
  const location = useLocation();
  const { t, locale, setLocale } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, signIn, signOut } = useAuth();
  const { claudePct, geminiPct } = useUsagePercent();
  const [menuOpen, setMenuOpen] = useState(false);

  const { scrollY } = useScroll();
  const headerHeight = useTransform(scrollY, [0, 80], [56, 48]);
  const borderOpacity = useTransform(scrollY, [0, 40], [0, 1]);
  const bgOpacity = useTransform(scrollY, [0, 40], [0.6, 0.92]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const isHome = location.pathname === "/";
  const isExceeded =
    user.claudeTokensUsed >= user.claudeTokensLimit &&
    user.geminiTokensUsed >= user.geminiTokensLimit;

  const toggleTheme = () =>
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  const toggleLocale = () => setLocale(locale === "tr" ? "en" : "tr");

  const openCommandPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      })
    );
  };

  return (
    <motion.header
      className="sticky top-0 z-40 backdrop-blur-xl"
      style={{ height: headerHeight }}
    >
      <motion.div
        className="absolute inset-0 bg-background"
        style={{ opacity: bgOpacity }}
      />
      <motion.div
        className="absolute inset-x-0 bottom-0 h-px bg-border"
        style={{ opacity: borderOpacity }}
      />

      <div className="relative mx-auto flex h-full max-w-6xl items-center justify-between gap-2 px-3 sm:px-4">
        {/* Logo */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 no-underline group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-[var(--shadow-sm)] transition-shadow group-hover:shadow-[var(--shadow-md)]">
            <BookOpenText className="h-4 w-4 text-primary-foreground" />
          </div>
          <span
            className="hidden text-foreground sm:inline"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.125rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              fontOpticalSizing: "auto",
            }}
          >
            HizmetSearch
          </span>
        </Link>

        {/* Command palette shortcut (desktop only, not on home) */}
        {!isHome && (
          <button
            onClick={openCommandPalette}
            className="hidden flex-1 max-w-sm items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:border-primary/20 transition-all md:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{t("nav.searchPlaceholder")}</span>
            <Kbd className="ml-auto">⌘K</Kbd>
          </button>
        )}

        <nav className="flex items-center gap-0.5">
          {/* Goes directly to /search so users can browse past searches in
              the sidebar even when they haven't kicked off a new query yet. */}
          <NavLink
            to="/search"
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

          <div className="mx-1 h-4 w-px bg-border hidden sm:block" />

          {/* Usage ring */}
          <div className="hidden sm:block">
            <UsageRing
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
          <Tooltip
            content={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            side="bottom"
          >
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </Tooltip>

          {/* Language toggle */}
          <Tooltip content="Toggle language" side="bottom">
            <button
              onClick={toggleLocale}
              className="hidden h-8 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:flex"
              aria-label="Toggle language"
            >
              <Languages className="h-3.5 w-3.5" />
              {locale.toUpperCase()}
            </button>
          </Tooltip>

          {/* User menu */}
          <div className="relative ml-0.5">
            {user.isAuthenticated ? (
              <>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  <User className="h-4 w-4 text-primary" />
                </button>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    className="absolute right-0 top-10 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-lg)] z-50"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <div className="border-b border-border px-3 py-3">
                      <div className="text-sm font-medium text-foreground truncate">
                        {user.name ?? user.email}
                      </div>
                      <div
                        className="mt-0.5 text-[11px] text-muted-foreground"
                        style={{
                          fontFamily: "var(--font-display)",
                          fontStyle: "italic",
                        }}
                      >
                        {user.plan} plan
                      </div>
                    </div>
                    <Link
                      to="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-foreground no-underline hover:bg-muted transition-colors"
                    >
                      <SettingsIcon className="h-3.5 w-3.5" />
                      {t("settings.title")}
                    </Link>
                    <button
                      onClick={() => {
                        signOut();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      {t("common.signOut")}
                    </button>
                  </motion.div>
                )}
              </>
            ) : (
              <button
                onClick={() => signIn()}
                className="flex h-8 items-center gap-1 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all shadow-[var(--shadow-sm)]"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("common.signIn")}</span>
              </button>
            )}
          </div>
        </nav>
      </div>
    </motion.header>
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
        "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium no-underline transition-all sm:px-3",
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
