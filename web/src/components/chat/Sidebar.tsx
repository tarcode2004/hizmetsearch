import { MessageSquare, Plus, Compass, Shield, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/I18nProvider";

interface SidebarProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** Hard-delete a conversation. If omitted, the trash button is hidden. */
  onDelete?: (id: string) => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  const { t } = useTranslation();

  const handleDelete = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    if (!onDelete) return;
    const ok = window.confirm(
      `Delete "${conv.title}"? This permanently removes the conversation and all its messages.`
    );
    if (ok) onDelete(conv._id);
  };

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
          <div className="grid gap-3">
            {bucketConversations(conversations).map((bucket) => (
              <div key={bucket.label} className="grid gap-0.5">
                <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {bucket.label}
                </div>
                {bucket.items.map((conv) => (
                  <div
                    key={conv._id}
                    className={cn(
                      "group relative flex items-start rounded-lg transition-colors",
                      activeId === conv._id
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <button
                      onClick={() => onSelect(conv._id)}
                      className="flex flex-1 items-start gap-2 px-3 py-2 text-left text-sm min-w-0"
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
                    {onDelete && (
                      <button
                        onClick={(e) => handleDelete(e, conv)}
                        className="mr-1 mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Delete conversation"
                        title="Delete conversation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function bucketConversations(convs: Conversation[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOf7d = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const buckets: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Last 7 days", items: [] },
    { label: "Earlier", items: [] },
  ];

  const sorted = [...convs].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const c of sorted) {
    if (c.updatedAt >= startOfToday) buckets[0].items.push(c);
    else if (c.updatedAt >= startOfYesterday) buckets[1].items.push(c);
    else if (c.updatedAt >= startOf7d) buckets[2].items.push(c);
    else buckets[3].items.push(c);
  }
  return buckets.filter((b) => b.items.length > 0);
}
