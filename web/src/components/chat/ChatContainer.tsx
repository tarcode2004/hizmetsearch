import { useState, useRef, useEffect } from "react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";
import { Sidebar } from "./Sidebar";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIModel, Message } from "@/lib/types";
import {
  MOCK_CONVERSATIONS,
  MOCK_MESSAGES,
  MOCK_AI_ANSWER,
  MOCK_RESULTS,
} from "@/lib/mock-data";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUpgradePopup } from "@/lib/upgrade/UpgradePopupProvider";

export function ChatContainer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { show: showUpgrade } = useUpgradePopup();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [model, setModel] = useState<AIModel>("gemini");
  const [activeConvId, setActiveConvId] = useState<string>(
    user.isAuthenticated ? "c1" : "new"
  );
  const [messages, setMessages] = useState<Message[]>(
    user.isAuthenticated ? MOCK_MESSAGES : []
  );
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Default to wider sidebar on desktop
  useEffect(() => {
    if (window.innerWidth >= 768) setSidebarOpen(true);
  }, []);

  const handleModelChange = (newModel: AIModel) => {
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
    setModel(newModel);
  };

  const handleSend = (content: string) => {
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

    const userMsg: Message = {
      _id: `m-${Date.now()}`,
      conversationId: activeConvId,
      role: "user",
      content,
      isStreaming: false,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Simulate streaming response
    const assistantId = `m-${Date.now() + 1}`;
    setTimeout(() => {
      setMessages((prev) => [
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
          setMessages((prev) =>
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
          setMessages((prev) =>
            prev.map((m) =>
              m._id === assistantId ? { ...m, content: fullText.slice(0, i) } : m
            )
          );
        }
      }, 30);
    }, 800);
  };

  const handleNewChat = () => {
    setActiveConvId(`c-${Date.now()}`);
    setMessages([]);
  };

  // Filter conversations: anonymous users have no history
  const conversations = user.isAuthenticated ? MOCK_CONVERSATIONS : [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden relative">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-20 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-lg border border-border md:hidden"
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed md:relative inset-y-0 left-0 z-30 transform transition-transform md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar
          conversations={conversations}
          activeId={activeConvId}
          onSelect={(id) => {
            setActiveConvId(id);
            if (id === "c1") setMessages(MOCK_MESSAGES);
            else setMessages([]);
            setSidebarOpen(false);
          }}
          onNew={handleNewChat}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-2 gap-2">
          <h2 className="text-sm font-semibold text-foreground truncate">
            {conversations.find((c) => c._id === activeConvId)?.title ??
              t("chat.newChat")}
          </h2>
          <ModelSelector
            model={model}
            onChange={handleModelChange}
            claudeLocked={user.plan === "anonymous"}
          />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
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
              <MessageBubble key={msg._id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}
