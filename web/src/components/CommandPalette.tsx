import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search as SearchIcon,
  MessageSquare,
  Settings as SettingsIcon,
  CreditCard,
  Home,
  Sun,
  Moon,
  Monitor,
  Languages,
  LogIn,
  Clock,
  Sparkles,
  BookOpenText,
} from "lucide-react";
import { cn, detectArabicScript } from "@/lib/utils";
import { Kbd } from "@/components/ui/Kbd";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useSearchHistory } from "@/lib/search/SearchHistoryProvider";
import { popIn, fade } from "@/lib/motion";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Global command palette (Cmd+K). Feels like a modern Linear/Raycast
 * style command menu — search previews, navigation, theme, language,
 * and recent items.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { locale, setLocale, t } = useTranslation();
  const { user } = useAuth();
  const { history } = useSearchHistory();
  const [search, setSearch] = useState("");

  // Close on navigation
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const recentSearches = useMemo(() => history.slice(0, 5), [history]);

  const run = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  const submitSearch = () => {
    if (search.trim()) {
      run(() => navigate(`/search?q=${encodeURIComponent(search.trim())}`));
    }
  };

  const isArabic = detectArabicScript(search);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade.quick}
          onClick={() => onOpenChange(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

          <motion.div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-xl)]"
            variants={popIn}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <Command
              label="Command palette"
              shouldFilter={true}
              className="[&_[cmdk-list]]:max-h-[min(60vh,500px)]"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-border px-4">
                <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder={
                    isArabic
                      ? "ابحث أو اكتب أمراً..."
                      : "Search, navigate, or run a command…"
                  }
                  dir={isArabic ? "rtl" : "ltr"}
                  className={cn(
                    "flex-1 h-14 bg-transparent text-base outline-none placeholder:text-muted-foreground/60",
                    isArabic && "font-[var(--font-arabic)] text-right"
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                      // Let cmdk handle selection if a result is focused
                      if (search.trim() && !document.querySelector('[cmdk-item][aria-selected="true"]')) {
                        e.preventDefault();
                        submitSearch();
                      }
                    }
                  }}
                />
                <Kbd className="text-[10px]">ESC</Kbd>
              </div>

              {/* Results */}
              <Command.List className="overflow-y-auto p-2">
                <Command.Empty className="py-12 text-center text-sm text-muted-foreground">
                  {search.trim()
                    ? `No matches — press Enter to search for "${search}"`
                    : "Type to begin…"}
                </Command.Empty>

                {/* ─── Action: run search ─── */}
                {search.trim() && (
                  <Command.Group>
                    <Command.Item
                      value={`search-${search}`}
                      onSelect={submitSearch}
                      className={itemClass}
                    >
                      <SearchIcon className="h-4 w-4 text-primary" />
                      <span className="flex-1 truncate">
                        Search sources for <span className="font-semibold">"{search}"</span>
                      </span>
                      <Kbd>↵</Kbd>
                    </Command.Item>
                  </Command.Group>
                )}

                {/* ─── Navigate ─── */}
                <Command.Group
                  heading={<GroupHeading>Go</GroupHeading>}
                  className="[&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2"
                >
                  <Command.Item
                    value="go-home"
                    onSelect={() => run(() => navigate("/"))}
                    className={itemClass}
                  >
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">Home</span>
                    <Kbd>g h</Kbd>
                  </Command.Item>
                  <Command.Item
                    value="go-search"
                    onSelect={() => run(() => navigate("/search"))}
                    className={itemClass}
                  >
                    <SearchIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{t("nav.search")}</span>
                    <Kbd>g s</Kbd>
                  </Command.Item>
                  <Command.Item
                    value="go-chat"
                    onSelect={() => run(() => navigate("/chat"))}
                    className={itemClass}
                  >
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{t("nav.chat")}</span>
                    <Kbd>g c</Kbd>
                  </Command.Item>
                  <Command.Item
                    value="go-pricing"
                    onSelect={() => run(() => navigate("/pricing"))}
                    className={itemClass}
                  >
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{t("pricing.title")}</span>
                  </Command.Item>
                  <Command.Item
                    value="go-settings"
                    onSelect={() => run(() => navigate("/settings"))}
                    className={itemClass}
                  >
                    <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{t("settings.title")}</span>
                    <Kbd>⌘ ,</Kbd>
                  </Command.Item>
                  {!user.isAuthenticated && (
                    <Command.Item
                      value="go-signin"
                      onSelect={() => run(() => navigate("/pricing"))}
                      className={itemClass}
                    >
                      <LogIn className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{t("common.signIn")}</span>
                    </Command.Item>
                  )}
                </Command.Group>

                {/* ─── Recent searches ─── */}
                {recentSearches.length > 0 && (
                  <Command.Group
                    heading={<GroupHeading>Recent searches</GroupHeading>}
                    className="[&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2"
                  >
                    {recentSearches.map((h) => {
                      const arabicQuery = detectArabicScript(h.query);
                      return (
                        <Command.Item
                          key={h.id}
                          value={`recent-${h.query}`}
                          onSelect={() =>
                            run(() =>
                              navigate(`/search?q=${encodeURIComponent(h.query)}`)
                            )
                          }
                          className={itemClass}
                        >
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span
                            className={cn(
                              "flex-1 truncate",
                              arabicQuery && "font-[var(--font-arabic)] text-right"
                            )}
                            dir={arabicQuery ? "rtl" : "ltr"}
                          >
                            {h.query}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {h.resultCount}
                          </span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {/* ─── Theme ─── */}
                <Command.Group
                  heading={<GroupHeading>Theme</GroupHeading>}
                  className="[&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2"
                >
                  <Command.Item
                    value="theme-light"
                    onSelect={() => run(() => setTheme("light"))}
                    className={itemClass}
                  >
                    <Sun className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">Light mode</span>
                  </Command.Item>
                  <Command.Item
                    value="theme-dark"
                    onSelect={() => run(() => setTheme("dark"))}
                    className={itemClass}
                  >
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">Dark mode</span>
                  </Command.Item>
                  <Command.Item
                    value="theme-system"
                    onSelect={() => run(() => setTheme("system"))}
                    className={itemClass}
                  >
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">System theme</span>
                  </Command.Item>
                </Command.Group>

                {/* ─── Language ─── */}
                <Command.Group
                  heading={<GroupHeading>Language</GroupHeading>}
                  className="[&_[cmdk-group-heading]]:mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2"
                >
                  <Command.Item
                    value="lang-tr"
                    onSelect={() => run(() => setLocale("tr"))}
                    className={itemClass}
                  >
                    <Languages className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">Türkçe</span>
                    {locale === "tr" && (
                      <span className="text-[10px] text-primary font-semibold">ACTIVE</span>
                    )}
                  </Command.Item>
                  <Command.Item
                    value="lang-en"
                    onSelect={() => run(() => setLocale("en"))}
                    className={itemClass}
                  >
                    <Languages className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">English</span>
                    {locale === "en" && (
                      <span className="text-[10px] text-primary font-semibold">ACTIVE</span>
                    )}
                  </Command.Item>
                </Command.Group>
              </Command.List>

              {/* Footer with shortcut hints */}
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <BookOpenText className="h-3 w-3" />
                  <span>HizmetSearch</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Kbd>↑↓</Kbd> navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <Kbd>↵</Kbd> select
                  </span>
                  <span className="flex items-center gap-1">
                    <Kbd>ESC</Kbd> close
                  </span>
                </div>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const itemClass = [
  "flex items-center gap-3 rounded-lg px-3 py-2.5",
  "text-sm text-foreground cursor-pointer",
  "data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary",
  "aria-selected:bg-primary/10 aria-selected:text-primary",
  "transition-colors",
].join(" ");

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      <Sparkles className="h-2.5 w-2.5" />
      {children}
    </div>
  );
}
