import { Link } from "react-router-dom";
import { Compass, Shield, Key, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { formatTokens } from "@/lib/billing";
import { spring } from "@/lib/motion";

interface UsageRingProps {
  claudeTokensUsed: number;
  claudeTokensLimit: number;
  claudePercentUsed: number;
  geminiTokensUsed: number;
  geminiTokensLimit: number;
  geminiPercentUsed: number;
  isExceeded: boolean;
  byokActive: boolean;
}

/**
 * Compact usage indicator for the header.
 * Single circular ring that shows the HIGHER of the two model
 * usage percents (i.e. the one you're closer to exhausting).
 * Hover reveals a tooltip with both breakdowns.
 *
 * If BYOK is active: shows a key icon instead.
 * If exceeded: shows a pulsing red zap icon.
 */
export function UsageRing({
  claudeTokensUsed,
  claudeTokensLimit,
  claudePercentUsed,
  geminiTokensUsed,
  geminiTokensLimit,
  geminiPercentUsed,
  isExceeded,
  byokActive,
}: UsageRingProps) {
  if (byokActive) {
    return (
      <Tooltip content="Your own API keys are active — unlimited usage" side="bottom">
        <Link
          to="/settings"
          className="flex h-8 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 text-[11px] font-semibold text-primary no-underline hover:bg-primary/15 transition-colors"
        >
          <Key className="h-3.5 w-3.5" />
          BYOK
        </Link>
      </Tooltip>
    );
  }

  if (isExceeded) {
    return (
      <Tooltip content="Token limit reached. Upgrade or add your own API key." side="bottom">
        <Link
          to="/pricing"
          className="flex h-8 items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 text-[11px] font-semibold text-destructive no-underline hover:bg-destructive/15 transition-colors animate-pulse"
        >
          <Zap className="h-3.5 w-3.5" />
          Limit
        </Link>
      </Tooltip>
    );
  }

  // Use the higher of the two percents — that's the one closest to running out
  const peakPercent = Math.max(claudePercentUsed, geminiPercentUsed);
  const peakModel: "claude" | "gemini" =
    claudePercentUsed >= geminiPercentUsed ? "claude" : "gemini";

  return (
    <Tooltip
      side="bottom"
      content={
        <div className="space-y-2 text-[11px]">
          <div>
            <div className="mb-1 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1 font-semibold">
                <Shield className="h-3 w-3 text-amber-500" />
                Claude
              </div>
              <span className="font-mono text-muted-foreground">
                {formatTokens(claudeTokensUsed)} / {formatTokens(claudeTokensLimit)}
              </span>
            </div>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  claudePercentUsed >= 90
                    ? "bg-destructive"
                    : claudePercentUsed >= 70
                      ? "bg-amber-500"
                      : "bg-amber-400"
                )}
                style={{ width: `${Math.min(claudePercentUsed, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1 font-semibold">
                <Compass className="h-3 w-3 text-blue-500" />
                Gemini
              </div>
              <span className="font-mono text-muted-foreground">
                {formatTokens(geminiTokensUsed)} / {formatTokens(geminiTokensLimit)}
              </span>
            </div>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  geminiPercentUsed >= 90
                    ? "bg-destructive"
                    : geminiPercentUsed >= 70
                      ? "bg-amber-500"
                      : "bg-blue-500"
                )}
                style={{ width: `${Math.min(geminiPercentUsed, 100)}%` }}
              />
            </div>
          </div>
          <div className="border-t border-border pt-1.5 text-[10px] text-muted-foreground">
            Click to manage plan
          </div>
        </div>
      }
    >
      <Link
        to="/settings"
        className="flex h-8 w-8 items-center justify-center rounded-full no-underline transition-colors hover:bg-muted"
      >
        <Ring percent={peakPercent} model={peakModel} />
      </Link>
    </Tooltip>
  );
}

function Ring({ percent, model }: { percent: number; model: "claude" | "gemini" }) {
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (Math.min(percent, 100) / 100) * circumference;

  const color =
    percent >= 90
      ? "oklch(56% 0.22 27)"
      : percent >= 70
        ? "oklch(72% 0.17 70)"
        : model === "claude"
          ? "oklch(72% 0.16 75)"
          : "oklch(62% 0.13 240)";

  const Icon = model === "claude" ? Shield : Compass;

  return (
    <div className="relative flex h-7 w-7 items-center justify-center">
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        className="absolute inset-0 -rotate-90"
      >
        {/* Track */}
        <circle
          cx="14"
          cy="14"
          r={radius}
          strokeWidth="2"
          stroke="var(--color-border)"
          fill="none"
        />
        {/* Progress */}
        <motion.circle
          cx="14"
          cy="14"
          r={radius}
          strokeWidth="2"
          stroke={color}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={spring.soft}
        />
      </svg>
      <Icon
        className="h-3 w-3"
        style={{ color }}
      />
    </div>
  );
}
