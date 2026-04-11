import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { AnonymousBanner } from "@/components/shared/AnonymousBanner";
// Eager: home + search are the main landing routes; the user typically
// hits one of them first.
import { HomePage } from "@/routes/index";
import { SearchPage } from "@/routes/search";
// Lazy: secondary routes are split out so they don't bloat the initial
// bundle. Each becomes its own chunk that loads on demand.
const ChatPage = lazy(() =>
  import("@/routes/chat").then((m) => ({ default: m.ChatPage }))
);
const PricingPage = lazy(() =>
  import("@/routes/pricing").then((m) => ({ default: m.PricingPage }))
);
const SettingsPage = lazy(() =>
  import("@/routes/settings").then((m) => ({ default: m.SettingsPage }))
);
// The source viewer pulls in pdfjs-dist (~400 KB gzipped) and is only opened
// from search results / citation clicks — lazy-load it so the initial bundle
// stays lean.
const SourceViewerPage = lazy(() =>
  import("@/routes/source-viewer").then((m) => ({ default: m.SourceViewerPage }))
);
// Public read-only shared conversation viewer.
const SharedConversationPage = lazy(() =>
  import("@/routes/shared").then((m) => ({ default: m.SharedConversationPage }))
);
import { trackPageView } from "@/lib/analytics";
import { UpgradePopupProvider } from "@/lib/upgrade/UpgradePopupProvider";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { NavProgress } from "@/components/ui/NavProgress";
import { Toaster } from "@/components/ui/Toaster";
import { PageTransition } from "@/components/motion/PageTransition";
import { FeedbackLauncher } from "@/components/feedback/FeedbackLauncher";

function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);
  return null;
}

/** Layout for all normal app pages — has the main Header and page transitions. */
function AppShell({ children }: { children: React.ReactNode }) {
  // h-[100dvh] + overflow-hidden constrains the shell to exactly the
  // viewport so descendants with `flex-1 min-h-0` can build internal
  // scroll regions (Search results column, chat message list, etc.)
  // without the page itself scrolling. PageTransition is the default
  // scroll container for pages that don't manage their own height.
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
      <Header />
      <AnonymousBanner />
      <PageTransition>{children}</PageTransition>
      <FeedbackLauncher />
    </div>
  );
}

/** Global keyboard shortcut handler mounted inside BrowserRouter. */
function GlobalHotkeys({
  onOpenCommand,
  onOpenHelp,
}: {
  onOpenCommand: () => void;
  onOpenHelp: () => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    let gPressed = false;
    let gTimer: number | undefined;

    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in form fields
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd/Ctrl + K → command palette (works even while typing)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenCommand();
        return;
      }

      // Cmd/Ctrl + , → settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        navigate("/settings");
        return;
      }

      if (isTyping) return;

      // ? → help
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onOpenHelp();
        return;
      }

      // g-prefix navigation (g h / g s / g c)
      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        gPressed = true;
        clearTimeout(gTimer);
        gTimer = window.setTimeout(() => {
          gPressed = false;
        }, 1000);
        return;
      }

      if (gPressed) {
        if (e.key === "h") {
          navigate("/");
          gPressed = false;
        } else if (e.key === "s") {
          navigate("/search");
          gPressed = false;
        } else if (e.key === "c") {
          navigate("/chat");
          gPressed = false;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(gTimer);
    };
  }, [navigate, onOpenCommand, onOpenHelp]);

  return null;
}

/** Centered loading spinner used as the lazy-route fallback. */
function RouteFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function lazyShell(node: React.ReactNode) {
  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>{node}</Suspense>
    </AppShell>
  );
}

function AppRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Standalone viewer — no app chrome, opens in new tab */}
        <Route
          path="/source/:docId"
          element={
            <Suspense
              fallback={
                <div className="flex h-screen items-center justify-center bg-background">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <SourceViewerPage />
            </Suspense>
          }
        />

        {/* Public shared conversation — no auth, no chrome */}
        <Route
          path="/share/:token"
          element={
            <Suspense
              fallback={
                <div className="flex h-screen items-center justify-center bg-background">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <SharedConversationPage />
            </Suspense>
          }
        />

        {/* Main app routes with header */}
        <Route
          path="/"
          element={
            <AppShell>
              <HomePage />
            </AppShell>
          }
        />
        <Route
          path="/search"
          element={
            <AppShell>
              <SearchPage />
            </AppShell>
          }
        />
        <Route path="/chat" element={lazyShell(<ChatPage />)} />
        <Route
          path="/chat/:conversationId"
          element={lazyShell(<ChatPage />)}
        />
        <Route path="/pricing" element={lazyShell(<PricingPage />)} />
        <Route path="/settings" element={lazyShell(<SettingsPage />)} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <BrowserRouter>
      <UpgradePopupProvider>
        <PageTracker />
        <NavProgress />
        <GlobalHotkeys
          onOpenCommand={() => setCmdOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />
        <AppRoutes />
        <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
        <KeyboardShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        <Toaster />
      </UpgradePopupProvider>
    </BrowserRouter>
  );
}
