import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ThemeProvider, useTheme } from "@/lib/theme/ThemeProvider";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { SearchHistoryProvider } from "@/lib/search/SearchHistoryProvider";
import { initObservability } from "@/lib/observability";
import { initAnalytics } from "@/lib/analytics";

initObservability();
initAnalytics();

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

// In demo mode (no `VITE_CONVEX_URL`) we still need a ConvexProvider mounted
// so components that call `useAction` / `useQuery` don't throw. Point at a
// localhost URL that will simply fail-fast on DNS instead of an externally
// resolvable hostname (which would log retry storms in the console).
const convex = new ConvexReactClient(convexUrl ?? "http://127.0.0.1:0");

/**
 * ClerkProvider wrapper that reads the resolved theme from `useTheme()`
 * and passes Clerk's prebuilt `dark` baseTheme accordingly. Must be mounted
 * inside ThemeProvider so `useTheme()` resolves.
 */
function ThemedClerkProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey!}
      appearance={{
        baseTheme: resolvedTheme === "dark" ? dark : undefined,
        variables: {
          // Match HizmetSearch's tezhib palette so the modal feels native
          colorPrimary:
            resolvedTheme === "dark" ? "#4a9d7e" : "#1f5f4a",
          fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
          borderRadius: "0.625rem",
        },
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useClerkAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

function Providers({ children }: { children: ReactNode }) {
  // Live mode (Convex + Clerk both configured)
  if (convexUrl && clerkPublishableKey) {
    return (
      <ThemeProvider>
        <ThemedClerkProvider>
          <I18nProvider>
            <AuthProvider>
              <SearchHistoryProvider>{children}</SearchHistoryProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemedClerkProvider>
      </ThemeProvider>
    );
  }

  // Demo mode — no Clerk; ConvexProvider is still mounted with a
  // non-connecting client so components can safely call Convex hooks
  // (they're gated by `BACKEND_ENABLED` and never actually fire).
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <SearchHistoryProvider>
            <ConvexProvider client={convex}>{children}</ConvexProvider>
          </SearchHistoryProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>
);
