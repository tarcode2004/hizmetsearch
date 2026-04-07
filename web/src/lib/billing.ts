import type { TranslationKey } from "@/lib/i18n/translations";

export type Plan = "anonymous" | "free" | "pro" | "scholar";

export interface PlanConfig {
  /** Translation key for plan name */
  nameKey: TranslationKey;
  price: string;
  priceMonthly: number;
  claudeTokens: number;
  geminiTokens: number;
  /** Translation keys for feature bullet list */
  featureKeys: TranslationKey[];
  highlight?: boolean;
  /** Translation key for CTA button label */
  ctaKey: TranslationKey;
  /** Translation key for badge ribbon */
  badgeKey?: TranslationKey;
  hideFromPricing?: boolean;
}

/**
 * Plans calibrated to actual API costs (April 2026):
 *   Claude Opus 4.6: ~$19/1M blended
 *   Gemini 3.1 Pro:  ~$9/1M blended
 *
 * Anonymous = no account, Gemini-only, 5K tokens.
 * Free = signed up, 20K Claude / 100K Gemini.
 * Pro = $9.99, 200K / 1M.
 * Scholar = $24.99, 1M / 5M.
 */
export const PLANS: Record<Plan, PlanConfig> = {
  anonymous: {
    nameKey: "plan.anonymous.name",
    price: "$0",
    priceMonthly: 0,
    claudeTokens: 0,
    geminiTokens: 5_000,
    featureKeys: [
      "plan.feature.5kGemini",
      "plan.feature.geminiOnly",
      "plan.feature.noAccount",
    ],
    ctaKey: "plan.current",
    hideFromPricing: true,
  },
  free: {
    nameKey: "plan.free.name",
    price: "$0",
    priceMonthly: 0,
    claudeTokens: 20_000,
    geminiTokens: 100_000,
    featureKeys: [
      "plan.feature.20kClaude",
      "plan.feature.100kGemini",
      "plan.feature.aiAnswerAndSearch",
      "plan.feature.chatAndVoice",
      "plan.feature.chatHistory",
    ],
    ctaKey: "plan.current",
  },
  pro: {
    nameKey: "plan.pro.name",
    price: "$9.99",
    priceMonthly: 9.99,
    claudeTokens: 200_000,
    geminiTokens: 1_000_000,
    featureKeys: [
      "plan.feature.200kClaude",
      "plan.feature.1mGemini",
      "plan.feature.allFreeFeatures",
      "plan.feature.priority",
      "plan.feature.exportHistory",
    ],
    highlight: true,
    ctaKey: "plan.upgradeToPro",
    badgeKey: "plan.popular",
  },
  scholar: {
    nameKey: "plan.scholar.name",
    price: "$24.99",
    priceMonthly: 24.99,
    claudeTokens: 1_000_000,
    geminiTokens: 5_000_000,
    featureKeys: [
      "plan.feature.1mClaude",
      "plan.feature.5mGemini",
      "plan.feature.allProFeatures",
      "plan.feature.priorityApi",
      "plan.feature.apiAccess",
      "plan.feature.support",
    ],
    ctaKey: "plan.upgradeToScholar",
    badgeKey: "plan.fullAccess",
  },
};

export const VISIBLE_PLANS: Plan[] = ["free", "pro", "scholar"];

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return "∞";
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export function getUsageColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-primary";
}

/** Get the next tier a user can upgrade to. */
export function getNextTier(plan: Plan): Plan | null {
  if (plan === "anonymous") return "free";
  if (plan === "free") return "pro";
  if (plan === "pro") return "scholar";
  return null;
}
