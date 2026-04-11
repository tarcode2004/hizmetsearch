import { AnimatePresence, motion } from "framer-motion";
import { X, Keyboard } from "lucide-react";
import { Kbd } from "@/components/ui/Kbd";
import { popIn, fade } from "@/lib/motion";

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ group: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    group: "Navigation",
    items: [
      { keys: ["⌘", "K"], label: "Open command palette" },
      { keys: ["⌘", "/"], label: "Focus search" },
      { keys: ["⌘", ","], label: "Open settings" },
      { keys: ["g", "h"], label: "Go home" },
      { keys: ["g", "s"], label: "Go to search" },
      { keys: ["g", "c"], label: "Go to chat" },
    ],
  },
  {
    group: "Lists",
    items: [
      { keys: ["j"], label: "Next result or message" },
      { keys: ["k"], label: "Previous result or message" },
      { keys: ["↵"], label: "Open focused item" },
    ],
  },
  {
    group: "Source viewer",
    items: [
      { keys: ["⌘", "B"], label: "Toggle outline panel" },
      { keys: ["⌘", "."], label: "Toggle chunk panel" },
      { keys: ["F"], label: "Zen mode" },
      { keys: ["Space"], label: "Play / pause (audio & video)" },
      { keys: ["←", "→"], label: "Seek 5s" },
      { keys: ["J", "L"], label: "Seek 15s" },
    ],
  },
  {
    group: "General",
    items: [
      { keys: ["?"], label: "Show this help" },
      { keys: ["ESC"], label: "Close modal / cancel" },
    ],
  },
];

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade.quick}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          <motion.div
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-xl)]"
            variants={popIn}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-primary" />
                <h2 className="text-h2-serif text-base">Keyboard shortcuts</h2>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Groups */}
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
              {SHORTCUTS.map((group) => (
                <div key={group.group}>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.group}
                  </div>
                  <ul className="space-y-1.5">
                    {group.items.map((item) => (
                      <li
                        key={item.label}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-foreground">{item.label}</span>
                        <span className="flex items-center gap-1">
                          {item.keys.map((k, i) => (
                            <Kbd key={i}>{k}</Kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
