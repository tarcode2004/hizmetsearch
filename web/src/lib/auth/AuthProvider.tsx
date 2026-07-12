/**
 * Auth provider — Clerk-backed when env vars are configured, otherwise
 * a localStorage-backed mock so the UI still runs in dev / static demo.
 *
 * The hook surface (`useAuth`) is intentionally identical between modes so
 * the rest of the app doesn't have to know which one is active.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import { BACKEND_ENABLED } from "@/lib/env";
import { setUserContext, clearUserContext } from "@/lib/observability";
import { identifyUser, resetIdentity } from "@/lib/analytics";

export type Plan = "anonymous" | "free" | "pro" | "scholar";

export interface UserState {
  isAuthenticated: boolean;
  plan: Plan;
  email?: string;
  name?: string;
  claudeTokensUsed: number;
  claudeTokensLimit: number;
  /** Remaining pre-paid Claude credit-pack tokens (0 when none). */
  claudeCreditTokens?: number;
  geminiTokensUsed: number;
  geminiTokensLimit: number;
  byokActive: boolean;
}

interface AuthContext {
  user: UserState;
  /** True while we don't yet know the user's actual plan/usage. */
  isLoading: boolean;
  signIn: (email?: string, name?: string) => void;
  signOut: () => void | Promise<void>;
  upgradeTo: (plan: Plan) => void;
  setUsage: (u: Partial<UserState>) => void;
}

const AuthCtx = createContext<AuthContext | null>(null);

const TIER_LIMITS: Record<Plan, { claude: number; gemini: number }> = {
  anonymous: { claude: 0, gemini: 5_000 },
  free: { claude: 400_000, gemini: 100_000 },
  pro: { claude: 6_000_000, gemini: 1_000_000 },
  scholar: { claude: 30_000_000, gemini: 5_000_000 },
};

const MOCK_STORAGE_KEY = "hizmetsearch.user";

function defaultAnonymous(): UserState {
  return {
    isAuthenticated: false,
    plan: "anonymous",
    claudeTokensUsed: 0,
    claudeTokensLimit: TIER_LIMITS.anonymous.claude,
    geminiTokensUsed: 1_200,
    geminiTokensLimit: TIER_LIMITS.anonymous.gemini,
    byokActive: false,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (BACKEND_ENABLED) {
    return <ClerkBackedProvider>{children}</ClerkBackedProvider>;
  }
  return <MockAuthProvider>{children}</MockAuthProvider>;
}

// ─── Mock implementation (no backend configured) ────────────────────────────

function MockAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserState>(() => {
    if (typeof window === "undefined") return defaultAnonymous();
    try {
      const stored = localStorage.getItem(MOCK_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      /* ignore */
    }
    return defaultAnonymous();
  });

  const update = useCallback((next: UserState) => {
    setUserState(next);
    try {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<AuthContext>(
    () => ({
      user,
      isLoading: false,
      signIn: (email = "demo@hizmetsearch.local", name) =>
        update({
          isAuthenticated: true,
          plan: "free",
          email,
          name,
          claudeTokensUsed: 6_800,
          claudeTokensLimit: TIER_LIMITS.free.claude,
          geminiTokensUsed: 34_200,
          geminiTokensLimit: TIER_LIMITS.free.gemini,
          byokActive: false,
        }),
      signOut: () => update(defaultAnonymous()),
      upgradeTo: (plan: Plan) => {
        const limits = TIER_LIMITS[plan];
        update({
          ...user,
          plan,
          isAuthenticated: plan !== "anonymous",
          claudeTokensLimit: limits.claude,
          geminiTokensLimit: limits.gemini,
        });
      },
      setUsage: (u) => update({ ...user, ...u }),
    }),
    [user, update]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// ─── Clerk + Convex implementation ──────────────────────────────────────────

function ClerkBackedProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  const { user: clerkUser } = useUser();
  const clerk = useClerk();
  const ensureUser = useMutation(api.users.ensureUser);
  const usage = useQuery(api.queries.usage.me, isAuthenticated ? {} : "skip");

  // First-sign-in: create the Convex `users` row + free subscription.
  // The mutation is idempotent server-side (see users.ensureUser).
  useEffect(() => {
    if (isAuthenticated && !convexAuthLoading) {
      ensureUser().catch((err) => console.error("ensureUser failed", err));
    }
  }, [isAuthenticated, convexAuthLoading, ensureUser]);

  // Pipe user identity into Sentry + PostHog so server errors and product
  // analytics events get attributed to the right user across sessions.
  useEffect(() => {
    if (isAuthenticated && clerkUser) {
      const profile = {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress,
        name: clerkUser.fullName ?? clerkUser.username ?? undefined,
      };
      setUserContext(profile);
      identifyUser({
        ...profile,
        plan: usage?.plan,
      });
    } else {
      clearUserContext();
      resetIdentity();
    }
  }, [isAuthenticated, clerkUser, usage?.plan]);

  const isAuthLoading = convexAuthLoading;
  const isUsageLoading = isAuthenticated && usage === undefined;
  const isLoading = isAuthLoading || isUsageLoading;

  const user = useMemo<UserState>(() => {
    if (!isAuthenticated || !clerkUser) {
      return defaultAnonymous();
    }
    if (!usage) {
      // While usage is loading we surface the Clerk identity but report
      // tokens as zero/zero so downstream UI can detect the loading state
      // via `isLoading` and render a skeleton instead of a stale plan.
      return {
        isAuthenticated: true,
        plan: "free",
        email: clerkUser.primaryEmailAddress?.emailAddress,
        name: clerkUser.fullName ?? clerkUser.username ?? undefined,
        claudeTokensUsed: 0,
        claudeTokensLimit: 0,
        geminiTokensUsed: 0,
        geminiTokensLimit: 0,
        byokActive: false,
      };
    }
    return {
      isAuthenticated: true,
      plan: usage.plan as Plan,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      name: clerkUser.fullName ?? clerkUser.username ?? undefined,
      claudeTokensUsed: usage.claudeTokensUsed,
      claudeTokensLimit: usage.claudeTokensLimit,
      claudeCreditTokens: usage.claudeCreditTokens ?? 0,
      geminiTokensUsed: usage.geminiTokensUsed,
      geminiTokensLimit: usage.geminiTokensLimit,
      byokActive: usage.byokActive,
    };
  }, [isAuthenticated, clerkUser, usage]);

  const value = useMemo<AuthContext>(
    () => ({
      user,
      isLoading,
      signIn: () => clerk.openSignIn(),
      signOut: () => clerk.signOut(),
      // Plan upgrades go through Stripe; the hook is a no-op in real mode.
      // The Stripe Checkout success URL re-mounts the app and the live
      // Convex query reflects the new plan.
      upgradeTo: () => {
        /* no-op in live mode */
      },
      // setUsage is a no-op in live mode — token usage comes from Convex
      // and BYOK toggle goes through `apiKeys.toggleByok`.
      setUsage: () => {
        /* no-op in live mode */
      },
    }),
    [user, isLoading, clerk]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useUsagePercent() {
  const { user } = useAuth();
  const claudePct =
    user.claudeTokensLimit > 0
      ? Math.min(
          100,
          Math.round((user.claudeTokensUsed / user.claudeTokensLimit) * 100)
        )
      : 0;
  const geminiPct =
    user.geminiTokensLimit > 0
      ? Math.min(
          100,
          Math.round((user.geminiTokensUsed / user.geminiTokensLimit) * 100)
        )
      : 0;
  return { claudePct, geminiPct };
}
