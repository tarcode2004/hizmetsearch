import { MessageSquare, Plus, Compass, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface SidebarProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({ conversations, activeId, onSelect, onNew }: SidebarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-muted/30">
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          {t("chat.newChat")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {t("chat.noConversations")}
          </div>
        ) : (
          <div className="grid gap-0.5">
            {conversations.map((conv) => (
              <button
                key={conv._id}
                onClick={() => onSelect(conv._id)}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  activeId === conv._id
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{conv.title}</p>
                  <div className="mt-0.5 flex items-center gap-1">
                    {conv.model === "claude" ? (
                      <Shield className="h-3 w-3 text-amber-600" />
                    ) : (
                      <Compass className="h-3 w-3 text-blue-600" />
                    )}
                    <span className="text-[10px]">
                      {new Date(conv.updatedAt).toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
