import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAction, useMutation } from "convex/react";
import { toast } from "sonner";
import { Telescope, Loader2 } from "lucide-react";
import { api } from "@convex/api";
import { cn, userFacingError } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useUpgradePopup } from "@/lib/upgrade/UpgradePopupProvider";
import { trackChatMessage } from "@/lib/analytics";
import { ESTIMATED_RESEARCH_ANSWER_TOKENS } from "../../../../convex/lib/planLimits";

/**
 * "Deep research" entry point on the /search results page.
 *
 * Visible to everyone; actionable for signed-in users with enough Claude
 * budget. Clicking creates a new chat conversation seeded with the current
 * query, fires `sendMessage` with `agentic: true` (the Claude Sonnet 5
 * research loop), and navigates to /chat/:conversationId where the
 * research timeline renders live. The instant AI Answer on this page is
 * untouched — this is a separate, slower, cited pipeline.
 *
 * Quota states:
 *  - anonymous            → sign-in prompt (upgrade popup)
 *  - out of Claude budget → visually disabled + tooltip; click opens the
 *                           upgrade popup (BYOK / plan upgrade)
 */
export function DeepResearchButton({ query }: { query: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { show: showUpgrade } = useUpgradePopup();
  const navigate = useNavigate();
  const createConversation = useMutation(api.mutations.conversations.create);
  const sendMessage = useAction(api.actions.chat.sendMessage);
  const [busy, setBusy] = useState(false);

  // Mirror of the server-side pre-flight in convex/actions/chat.ts: one
  // deep answer costs ~90K billing-equivalent Claude tokens.
  const claudeRemaining =
    Math.max(0, user.claudeTokensLimit - user.claudeTokensUsed) +
    (user.claudeCreditTokens ?? 0);
  const hasBudget =
    user.byokActive || claudeRemaining >= ESTIMATED_RESEARCH_ANSWER_TOKENS;
  const blocked = user.isAuthenticated && !hasBudget;

  const handleClick = async () => {
    if (busy || !query.trim()) return;
    if (!user.isAuthenticated) {
      showUpgrade("anon-claude-locked");
      return;
    }
    if (!hasBudget) {
      if (user.plan === "free") showUpgrade("free-claude-exhausted");
      else if (user.plan === "pro") showUpgrade("pro-claude-exhausted");
      else toast.error(t("deepResearch.quotaToast"));
      return;
    }
    setBusy(true);
    try {
      const conversationId = await createConversation({
        title: query.length > 60 ? query.slice(0, 57).trimEnd() + "…" : query,
        model: "claude",
      });
      trackChatMessage("claude", "deep-research");
      // Fire the research loop but don't await it (it runs ~1 minute);
      // the chat page shows the live research timeline reactively. The
      // Convex client outlives this component, so the call survives the
      // navigation below. Server-side quota errors surface as a toast.
      sendMessage({
        conversationId,
        content: query,
        model: "claude",
        agentic: true,
      }).catch((err) => {
        console.error("deep research sendMessage failed", err);
        toast.error(userFacingError(err, t("deepResearch.failed")));
      });
      navigate(`/chat/${conversationId}`);
    } catch (err) {
      console.error("deep research start failed", err);
      toast.error(userFacingError(err, t("deepResearch.startFailed")));
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Telescope className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">
            {t("deepResearch.label")}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {t("deepResearch.searchDesc")}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleClick}
        aria-disabled={blocked || busy}
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition-colors",
          blocked
            ? "cursor-not-allowed border border-border bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        title={
          blocked
            ? t("deepResearch.blockedTooltip").replace(
                "{tokens}",
                String(Math.round(ESTIMATED_RESEARCH_ANSWER_TOKENS / 1000)),
              )
            : t("deepResearch.startTooltip")
        }
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Telescope className="h-3.5 w-3.5" />
        )}
        {busy ? t("deepResearch.starting") : t("deepResearch.start")}
      </button>
    </div>
  );
}
