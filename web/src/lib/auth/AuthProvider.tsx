import { createContext, useContext, useState, type ReactNode } from "react";

export type Plan = "anonymous" | "free" | "pro" | "scholar";

export interface UserState {
  isAuthenticated: boolean;
  plan: Plan;
  email?: string;
  name?: string;
  // Per-model usage
  claudeTokensUsed: number;
  claudeTokensLimit: number;
  geminiTokensUsed: number;
  geminiTokensLimit: number;
  byokActive: boolean;
}

interface AuthContext {
  user: UserState;
  signIn: (email: string, name?: string) => void;
  signOut: () => void;
  upgradeTo: (plan: Plan) => void;
  // For demo: increment usage manually
  setUsage: (u: Partial<UserState>) => void;
}

const AuthCtx = createContext<AuthContext | null>(null);

const STORAGE_KEY = "hizmetsearch.user";

const TIER_LIMITS: Record<Plan, { claude: number; gemini: number }> = {
  anonymous: { claude: 0, gemini: 5_000 },
  free: { claude: 20_000, gemini: 100_000 },
  pro: { claude: 200_000, gemini: 1_000_000 },
  scholar: { claude: 1_000_000, gemini: 5_000_000 },
};

function loadUser(): UserState {
  if (typeof window === "undefined") {
    return defaultAnonymous();
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return defaultAnonymous();
}

function defaultAnonymous(): UserState {
  return {
    isAuthenticated: false,
    plan: "anonymous",
    claudeTokensUsed: 0,
    claudeTokensLimit: TIER_LIMITS.anonymous.claude,
    geminiTokensUsed: 1_200, // demo: some usage already accumulated
    geminiTokensLimit: TIER_LIMITS.anonymous.gemini,
    byokActive: false,
  };
}

function saveUser(user: UserState) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserState>(loadUser);

  const update = (next: UserState) => {
    setUserState(next);
    saveUser(next);
  };

  const signIn = (email: string, name?: string) => {
    update({
      isAuthenticated: true,
      plan: "free",
      email,
      name,
      claudeTokensUsed: 6_800, // demo data
      claudeTokensLimit: TIER_LIMITS.free.claude,
      geminiTokensUsed: 34_200,
      geminiTokensLimit: TIER_LIMITS.free.gemini,
      byokActive: false,
    });
  };

  const signOut = () => {
    update(defaultAnonymous());
  };

  const upgradeTo = (plan: Plan) => {
    const limits = TIER_LIMITS[plan];
    update({
      ...user,
      plan,
      isAuthenticated: plan !== "anonymous",
      claudeTokensLimit: limits.claude,
      geminiTokensLimit: limits.gemini,
    });
  };

  const setUsage = (u: Partial<UserState>) => {
    update({ ...user, ...u });
  };

  return (
    <AuthCtx.Provider value={{ user, signIn, signOut, upgradeTo, setUsage }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useUsagePercent() {
  const { user } = useAuth();
  const claudePct = user.claudeTokensLimit > 0
    ? Math.min(100, Math.round((user.claudeTokensUsed / user.claudeTokensLimit) * 100))
    : 0;
  const geminiPct = user.geminiTokensLimit > 0
    ? Math.min(100, Math.round((user.geminiTokensUsed / user.geminiTokensLimit) * 100))
    : 0;
  return { claudePct, geminiPct };
}
