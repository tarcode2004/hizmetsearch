import { useState, useRef, useEffect, useMemo } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";
import { Sidebar } from "./Sidebar";
import {
  Menu,
  X,
  ExternalLink,
  Download,
  Share2,
  Copy,
  XCircle,
  ChevronDown,
  Telescope,
} from "lucide-react";
import { cn, detectArabicScript } from "@/lib/utils";
import { buildSourceViewerUrl } from "@/lib/source-viewer";
import { BACKEND_ENABLED } from "@/lib/env";
import { downloadConversation } from "@/lib/chat/exportConversation";
import { captureError } from "@/lib/observability";
import {
  trackChatMessage,
  trackChatModelSwitch,
  trackShareLinkCreated,
  trackConversationDeleted,
} from "@/lib/analytics";
import { defaultVariantId } from "../../../../convex/lib/modelCatalog";
import type { AIModel, ChunkResult, Message } from "@/lib/types";
import {
  MOCK_CONVERSATIONS,
  MOCK_MESSAGES,
  MOCK_AI_ANSWER,
  MOCK_RESULTS,
} from "@/lib/mock-data";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUpgradePopup } from "@/lib/upgrade/UpgradePopupProvider";

interface ChatContainerProps {
  /** When set (typically by react-router via /chat/:conversationId),
   *  ChatContainer boots into the named conversation in live mode and
   *  fetches its messages instead of starting a fresh draft. Used by
   *  the search page's "Keep chatting" button. */
  routeConversationId?: string;
}

export function ChatContainer({ routeConversationId }: ChatContainerProps = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { show: showUpgrade } = useUpgradePopup();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [model, setModel] = useState<AIModel>("gemini");
  const [modelVariant, setModelVariant] = useState<string>(() =>
    defaultVariantId("gemini")
  );
  // `activeConv` tracks both the id AND whether it points at a real Convex
  // row (`isLive`). This replaces the brittle "starts with k" heuristic and
  // makes conversation switching explicit.
  type ActiveConv = { id: string; isLive: boolean };
  const [activeConv, setActiveConv] = useState<ActiveConv>(() => {
    // If we landed on /chat/:conversationId, immediately mark that
    // conversation as live so the byConversation query fires on the
    // very first render (no flash of empty draft state).
    if (routeConversationId && BACKEND_ENABLED && user.isAuthenticated) {
      return { id: routeConversationId, isLive: true };
    }
    return user.isAuthenticated && !BACKEND_ENABLED
      ? { id: "c1", isLive: false }
      : { id: "new", isLive: false };
  });

  // If the URL changes after mount (e.g. user clicks the in-app
  // "Keep chatting" button while already on /chat, or react-router
  // navigates between conversation deep-links), keep activeConv in
  // sync. Skipping this leaves the user staring at the previous
  // conversation despite the URL having changed.
  useEffect(() => {
    if (!routeConversationId) return;
    if (!BACKEND_ENABLED || !user.isAuthenticated) return;
    if (activeConv.id === routeConversationId && activeConv.isLive) return;
    setActiveConv({ id: routeConversationId, isLive: true });
  }, [routeConversationId, user.isAuthenticated, activeConv.id, activeConv.isLive]);
  const activeConvId = activeConv.id;
  const [mockMessages, setMockMessages] = useState<Message[]>(
    user.isAuthenticated && !BACKEND_ENABLED ? MOCK_MESSAGES : []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<ChunkResult | null>(null);
  // Deep-search (agentic) toggle. When on, the next message runs the
  // multi-round search loop in convex/actions/chat.ts → up to 6 search
  // rounds and ~36 sources. Default ON for Gemini (cheap planner +
  // cheap synthesis), default OFF for Claude (10× the synthesis cost).
  // Switching models mid-conversation does NOT auto-toggle — the user
  // stays in control once they've expressed a preference.
  const [agentic, setAgentic] = useState(() => model === "gemini");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Live Convex queries ───────────────────────────────────
  const liveConversations = useQuery(
    api.queries.conversations.list,
    BACKEND_ENABLED && user.isAuthenticated ? {} : "skip"
  );
  const liveMessages = useQuery(
    api.queries.messages.byConversation,
    BACKEND_ENABLED && user.isAuthenticated && activeConv.isLive
      ? { conversationId: activeConv.id as Id<"conversations"> }
      : "skip"
  );
  const sendMessageAction = useAction(api.actions.chat.sendMessage);
  const createConversation = useMutation(api.mutations.conversations.create);
  const removeConversation = useMutation(api.mutations.conversations.remove);
  const generateShareToken = useMutation(
    api.mutations.conversations.generateShareToken
  );
  const revokeShareToken = useMutation(
    api.mutations.conversations.revokeShareToken
  );

  // Whether the active conversation has been shared. Read off the live
  // conversations list (which includes the `shareToken` field) so the
  // dropdown menu items reflect actual server state, not stale UI state.
  const isShared =
    activeConv.isLive &&
    !!liveConversations &&
    !!(liveConversations as Array<{ _id: string; shareToken?: string }>).find(
      (c) => c._id === activeConv.id
    )?.shareToken;

  const handleDeleteConversation = async (id: string) => {
    if (BACKEND_ENABLED && user.isAuthenticated) {
      try {
        await removeConversation({ conversationId: id as Id<"conversations"> });
        trackConversationDeleted(id);
        // If we just deleted the active conversation, drop back to a fresh draft
        if (id === activeConv.id) {
          setActiveConv({ id: `c-${Date.now()}`, isLive: false });
        }
        toast.success("Conversation deleted");
      } catch (err) {
        console.error("delete conversation failed", err);
        captureError(err, { where: "chat.deleteConversation" });
        toast.error("Could not delete conversation");
      }
    } else {
      // Demo mode — just clear local state
      if (id === activeConv.id) {
        setActiveConv({ id: `c-${Date.now()}`, isLive: false });
        setMockMessages([]);
      }
    }
  };

  const handleCopyShareLink = async () => {
    try {
      const token = await generateShareToken({
        conversationId: activeConv.id as Id<"conversations">,
      });
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      trackShareLinkCreated(activeConv.id);
      toast.success(t("chat.share.copied"));
    } catch (err) {
      console.error("share failed", err);
      captureError(err, { where: "chat.share" });
      toast.error(t("chat.share.error"));
    }
  };

  const handleRevokeShare = async () => {
    try {
      await revokeShareToken({
        conversationId: activeConv.id as Id<"conversations">,
      });
      toast.success(t("chat.share.revoked"));
    } catch (err) {
      console.error("revoke share failed", err);
      captureError(err, { where: "chat.revokeShare" });
      toast.error(t("chat.share.error"));
    }
  };

  // Live messages → Message[] shape used by MessageBubble.
  // While `liveMessages` is undefined we return [] (loading state) instead
  // of falling through to mock data, so the UI can show a clean empty view
  // while the new conversation's messages are being fetched.
  const messages: Message[] = useMemo(() => {
    if (BACKEND_ENABLED && user.isAuthenticated) {
      if (!activeConv.isLive) return mockMessages;
      if (liveMessages === undefined) return [];
      return (liveMessages as Message[]).map((m) => ({
        _id: m._id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        model: m.model,
        sources: m.sources as ChunkResult[] | undefined,
        isStreaming: m.isStreaming,
        agenticSteps: m.agenticSteps,
        agenticStatus: m.agenticStatus,
        createdAt: m.createdAt,
      }));
    }
    return mockMessages;
  }, [liveMessages, mockMessages, user.isAuthenticated, activeConv.isLive]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Default to wider sidebar on desktop
  useEffect(() => {
    if (window.innerWidth >= 768) setSidebarOpen(true);
  }, []);

  const handleModelChange = (newModel: AIModel, newVariant: string) => {
    // Anonymous users can't use Claude
    if (newModel === "claude" && user.plan === "anonymous") {
      showUpgrade("anon-claude-locked");
      return;
    }
    // Free users with no remaining Claude tokens
    if (
      newModel === "claude" &&
      user.plan === "free" &&
      user.claudeTokensUsed >= user.claudeTokensLimit &&
      !user.byokActive
    ) {
      showUpgrade("free-claude-exhausted");
      return;
    }
    if (newModel !== model) {
      trackChatModelSwitch(model, newModel, newVariant);
    }
    setModel(newModel);
    setModelVariant(newVariant);
  };

  const handleSend = async (content: string) => {
    // Check token budget for chosen model
    const used = model === "claude" ? user.claudeTokensUsed : user.geminiTokensUsed;
    const limit = model === "claude" ? user.claudeTokensLimit : user.geminiTokensLimit;
    if (!user.byokActive && used >= limit) {
      if (user.plan === "anonymous") {
        showUpgrade("anon-tokens-exhausted");
      } else if (user.plan === "free") {
        showUpgrade("free-to-pro");
      } else if (user.plan === "pro") {
        showUpgrade("pro-to-scholar");
      }
      return;
    }

    if (BACKEND_ENABLED && user.isAuthenticated) {
      // Live path: ensure we have a real conversation row, then call action.
      let convId = activeConv.id;
      if (!activeConv.isLive) {
        const newId = await createConversation({
          title: content.slice(0, 60),
          model,
        });
        convId = newId;
        setActiveConv({ id: newId, isLive: true });
      }
      setIsLoading(true);
      trackChatMessage(model, modelVariant);
      try {
        await sendMessageAction({
          conversationId: convId as Id<"conversations">,
          content,
          model,
          modelVariant,
          agentic,
        });
      } catch (err) {
        console.error("sendMessage failed", err);
        captureError(err, { where: "chat.sendMessage", model });
        toast.error(
          err instanceof Error ? err.message : "Failed to send message"
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Mock path
    const userMsg: Message = {
      _id: `m-${Date.now()}`,
      conversationId: activeConvId,
      role: "user",
      content,
      isStreaming: false,
      createdAt: Date.now(),
    };
    setMockMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const assistantId = `m-${Date.now() + 1}`;
    setTimeout(() => {
      setMockMessages((prev) => [
        ...prev,
        {
          _id: assistantId,
          conversationId: activeConvId,
          role: "assistant",
          content: "",
          model,
          isStreaming: true,
          createdAt: Date.now(),
        },
      ]);

      const fullText = MOCK_AI_ANSWER;
      let i = 0;
      const interval = setInterval(() => {
        i += 12;
        if (i >= fullText.length) {
          setMockMessages((prev) =>
            prev.map((m) =>
              m._id === assistantId
                ? {
                    ...m,
                    content: fullText,
                    isStreaming: false,
                    sources: MOCK_RESULTS.map((r) => r.chunk),
                  }
                : m
            )
          );
          setIsLoading(false);
          clearInterval(interval);
        } else {
          setMockMessages((prev) =>
            prev.map((m) =>
              m._id === assistantId ? { ...m, content: fullText.slice(0, i) } : m
            )
          );
        }
      }, 30);
    }, 800);
  };

  const handleNewChat = () => {
    setActiveConv({ id: `c-${Date.now()}`, isLive: false });
    setMockMessages([]);
  };

  // Conversations list (live or mock)
  type ConvRow = {
    _id: string;
    userId: string;
    title: string;
    updatedAt: number;
    createdAt: number;
    isArchived: boolean;
    model: AIModel;
  };
  const conversations: ConvRow[] =
    BACKEND_ENABLED && user.isAuthenticated && liveConversations
      ? (liveConversations as ConvRow[]).map((c) => ({
          _id: c._id,
          userId: c.userId ?? "",
          title: c.title,
          updatedAt: c.updatedAt,
          createdAt: c.createdAt ?? c.updatedAt,
          isArchived: c.isArchived ?? false,
          model: c.model,
        }))
      : user.isAuthenticated
        ? (MOCK_CONVERSATIONS as ConvRow[])
        : [];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden relative">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-16 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-lg border border-border md:hidden"
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "absolute md:relative inset-y-0 left-0 z-30 transform transition-transform md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={(id) => {
            // Determine if this is a real Convex row by checking the live
            // conversations list — anything in there is live; anything else
            // is a mock id (`c1`, etc).
            const isLive =
              BACKEND_ENABLED &&
              !!liveConversations &&
              liveConversations.some((c: { _id: string }) => c._id === id);
            setActiveConv({ id, isLive });
            if (!isLive) {
              if (id === "c1") setMockMessages(MOCK_MESSAGES);
              else setMockMessages([]);
            }
            setSidebarOpen(false);
          }}
          onNew={handleNewChat}
          onDelete={handleDeleteConversation}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center justify-between border-b border-border bg-card/50 px-3 py-2 gap-2 sm:px-4">
          <h2 className="min-w-0 flex-1 text-sm font-semibold text-foreground truncate">
            {conversations.find((c) => c._id === activeConvId)?.title ??
              t("chat.newChat")}
          </h2>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {messages.length > 0 && activeConv.isLive && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className="flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title={t("chat.share")}
                  >
                    <Share2 className="h-3 w-3" />
                    <span className="hidden sm:inline">{t("chat.share")}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    className="z-50 min-w-[180px] overflow-hidden rounded-lg border border-border bg-card p-1 shadow-[var(--shadow-lg)]"
                  >
                    <DropdownMenu.Item
                      onSelect={handleCopyShareLink}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-foreground outline-none hover:bg-muted focus:bg-muted"
                    >
                      <Copy className="h-3.5 w-3.5 text-primary" />
                      {isShared ? t("chat.share.copy") : "Create share link"}
                    </DropdownMenu.Item>
                    {isShared && (
                      <DropdownMenu.Item
                        onSelect={handleRevokeShare}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-foreground outline-none hover:bg-muted focus:bg-muted"
                      >
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                        {t("chat.share.revoke")}
                      </DropdownMenu.Item>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
            {messages.length > 0 && (
              <button
                onClick={() => {
                  const title =
                    conversations.find((c) => c._id === activeConvId)?.title ??
                    t("chat.newChat");
                  downloadConversation(title, messages);
                }}
                className="flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={t("chat.export.title")}
              >
                <Download className="h-3 w-3" />
                <span className="hidden sm:inline">{t("chat.export")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setAgentic((v) => !v)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
                agentic
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
              title="Deep search: runs multiple follow-up searches and gathers up to ~36 sources before answering. Slower and more expensive."
            >
              <Telescope className="h-3 w-3" />
              <span className="hidden sm:inline">Deep search</span>
            </button>
            <ModelSelector
              model={model}
              variantId={modelVariant}
              onChange={handleModelChange}
              claudeLocked={user.plan === "anonymous"}
            />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-[720px] space-y-6">
            {messages.length === 0 && (
              <div className="py-20 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <span className="text-3xl">📚</span>
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("chat.empty.title")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("chat.empty.subtitle")}
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg._id}
                message={msg}
                onCitationSelect={setSelectedSource}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>

      {/* Right source preview — desktop only */}
      {selectedSource && (
        <aside className="hidden md:flex w-[380px] shrink-0 flex-col border-l border-border bg-card/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Source preview
            </div>
            <button
              onClick={() => setSelectedSource(null)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <ChatSourcePreview source={selectedSource} />
          </div>
        </aside>
      )}
    </div>
  );
}

function ChatSourcePreview({ source }: { source: ChunkResult }) {
  const isArabic = detectArabicScript(source.parent_text ?? source.text);
  return (
    <div className="space-y-3">
      <div>
        <h3
          className="text-sm font-semibold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {source.title}
        </h3>
        {source.author_speaker && (
          <p
            className="mt-0.5 text-[11px] text-muted-foreground"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            {source.author_speaker}
          </p>
        )}
        {source.chapter_section && (
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground/80">
            {source.chapter_section}
          </p>
        )}
      </div>
      <div
        dir={isArabic ? "rtl" : "ltr"}
        className={cn(
          "rounded-lg border border-border/60 bg-background/50 p-3 text-[13px] leading-relaxed text-foreground/85",
          isArabic && "font-[var(--font-arabic)] text-base"
        )}
      >
        {source.parent_text ?? source.text}
      </div>
      <a
        href={buildSourceViewerUrl(source)}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1 text-[11px] text-primary no-underline hover:underline"
      >
        Open in viewer
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
