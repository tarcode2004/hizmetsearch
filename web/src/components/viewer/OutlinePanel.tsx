import { motion } from "framer-motion";
import { List, ChevronRight, FileText, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/I18nProvider";
import { formatTimestamp } from "@/lib/utils";
import { spring } from "@/lib/motion";

export interface OutlineEntry {
  id: string;
  title: string;
  /** For PDFs: page number. For text: scroll offset. For audio/video: seconds. */
  location: number;
  depth?: number;
  /** True if this entry is where the cited chunk lives */
  isChunkTarget?: boolean;
  /** True if this entry is currently visible / playing */
  isActive?: boolean;
}

interface OutlinePanelProps {
  /** Type of outline — determines label formatting. */
  variant: "pdf" | "text" | "audio" | "video";
  entries: OutlineEntry[];
  onSelect: (entry: OutlineEntry) => void;
  loading?: boolean;
  /** Optional message when there are no entries (e.g. PDF has no embedded TOC). */
  emptyMessage?: string;
}

export function OutlinePanel({
  variant,
  entries,
  onSelect,
  loading = false,
  emptyMessage,
}: OutlinePanelProps) {
  const { t: _t } = useTranslation();

  const Icon = variant === "audio" || variant === "video" ? Music2 : List;
  const titleLabel =
    variant === "audio" || variant === "video" ? "Transcript" : "Outline";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-primary" />
          <h3
            className="text-sm"
            style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}
          >
            {titleLabel}
          </h3>
        </div>
        {!loading && entries.length > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {entries.length}
          </span>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex flex-col gap-2 px-2 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-4 rounded bg-muted/70 animate-pulse"
                style={{ width: `${60 + Math.random() * 35}%` }}
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              {emptyMessage ?? "No outline available"}
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {entries.map((entry) => (
              <OutlineItem
                key={entry.id}
                entry={entry}
                variant={variant}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OutlineItem({
  entry,
  variant,
  onSelect,
}: {
  entry: OutlineEntry;
  variant: OutlinePanelProps["variant"];
  onSelect: (entry: OutlineEntry) => void;
}) {
  const depth = entry.depth ?? 0;
  const locationLabel =
    variant === "audio" || variant === "video"
      ? formatTimestamp(entry.location)
      : `${entry.location}`;

  return (
    <li>
      <motion.button
        layout
        onClick={() => onSelect(entry)}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
          entry.isActive
            ? "bg-primary/10 text-primary"
            : "text-foreground/80 hover:bg-muted hover:text-foreground"
        )}
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
        transition={spring.snappy}
      >
        {/* Chunk target marker — small gilt bullet */}
        {entry.isChunkTarget && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--color-gilt)" }}
            aria-label="Cited chunk is here"
          />
        )}
        {!entry.isChunkTarget && depth > 0 && (
          <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
        )}
        <span className="flex-1 truncate">{entry.title}</span>
        <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
          {locationLabel}
        </span>
      </motion.button>
    </li>
  );
}
