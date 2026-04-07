import { Key, ArrowRight, Shield, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatTokens } from "@/lib/billing";

interface UsageBannerProps {
  claudeTokensUsed: number;
  claudeTokensLimit: number;
  claudePercentUsed: number;
  geminiTokensUsed: number;
  geminiTokensLimit: number;
  geminiPercentUsed: number;
  isExceeded: boolean;
  byokActive: boolean;
}

export function UsageBanner({
  claudeTokensUsed,
  claudeTokensLimit,
  claudePercentUsed,
  geminiTokensUsed,
  geminiTokensLimit,
  geminiPercentUsed,
  isExceeded,
  byokActive,
}: UsageBannerProps) {
  if (byokActive) {
    return (
      <Link
        to="/settings"
        className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary no-underline hover:bg-primary/15 transition-colors"
      >
        <Key className="h-3 w-3" />
        BYOK
      </Link>
    );
  }

  if (isExceeded) {
    return (
      <Link
        to="/pricing"
        className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 no-underline hover:bg-red-100 transition-colors animate-pulse"
      >
        Limit doldu
        <ArrowRight className="h-3 w-3" />
      </Link>
    );
  }

  return (
    <Link
      to="/settings"
      className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 no-underline hover:bg-muted transition-colors"
      title={`Claude: ${formatTokens(claudeTokensUsed)}/${formatTokens(claudeTokensLimit)} • Gemini: ${formatTokens(geminiTokensUsed)}/${formatTokens(geminiTokensLimit)}`}
    >
      {/* Claude bar */}
      <div className="flex items-center gap-1">
        <Shield className="h-2.5 w-2.5 text-amber-600" />
        <div className="h-1.5 w-8 rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              claudePercentUsed >= 90 ? "bg-red-500" :
              claudePercentUsed >= 70 ? "bg-amber-500" :
              "bg-amber-400"
            )}
            style={{ width: `${Math.min(claudePercentUsed, 100)}%` }}
          />
        </div>
      </div>

      {/* Gemini bar */}
      <div className="flex items-center gap-1">
        <Compass className="h-2.5 w-2.5 text-blue-600" />
        <div className="h-1.5 w-8 rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              geminiPercentUsed >= 90 ? "bg-red-500" :
              geminiPercentUsed >= 70 ? "bg-amber-500" :
              "bg-blue-500"
            )}
            style={{ width: `${Math.min(geminiPercentUsed, 100)}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
