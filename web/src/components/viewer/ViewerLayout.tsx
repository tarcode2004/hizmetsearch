import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";
import { Tooltip } from "@/components/ui/Tooltip";
import { Kbd } from "@/components/ui/Kbd";

interface ViewerLayoutProps {
  header: ReactNode;
  outline?: ReactNode;
  chunk: ReactNode;
  children: ReactNode;
  /** Panel IDs for localStorage persistence */
  storageKey?: string;
  /** Whether the outline panel even makes sense for this source type. */
  outlineAvailable?: boolean;
}

interface LayoutState {
  outlineOpen: boolean;
  chunkOpen: boolean;
  zen: boolean;
}

const DEFAULT_STATE: LayoutState = {
  outlineOpen: true,
  chunkOpen: true,
  zen: false,
};

function loadState(key: string): LayoutState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        outlineOpen: parsed.outlineOpen ?? true,
        chunkOpen: parsed.chunkOpen ?? true,
        zen: false, // never persist zen mode
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_STATE;
}

/**
 * Three-pane viewer shell used by PDF / Text / Audio / Video variants.
 *
 * Layout:
 *   ┌────────── ViewerHeader (sticky) ──────────┐
 *   ├──────────┬────────────────┬────────────────┤
 *   │ Outline  │   Document     │   Chunk panel  │
 *   │ (left)   │   (middle)     │   (right)      │
 *   └──────────┴────────────────┴────────────────┘
 *
 * - ⌘B toggles outline panel
 * - ⌘. toggles chunk panel
 * - F enters Zen mode (header + both panels hidden)
 * - Panel states persist to localStorage
 */
export function ViewerLayout({
  header,
  outline,
  chunk,
  children,
  storageKey = "hizmetsearch.viewer.layout",
  outlineAvailable = true,
}: ViewerLayoutProps) {
  const [state, setState] = useState<LayoutState>(() => loadState(storageKey));

  // Persist (skip zen mode)
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ outlineOpen: state.outlineOpen, chunkOpen: state.chunkOpen })
    );
  }, [state.outlineOpen, state.chunkOpen, storageKey]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // ⌘B → toggle outline
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (outlineAvailable) {
          setState((s) => ({ ...s, outlineOpen: !s.outlineOpen }));
        }
        return;
      }

      // ⌘. → toggle chunk
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setState((s) => ({ ...s, chunkOpen: !s.chunkOpen }));
        return;
      }

      // F → zen mode (not while typing)
      if (!isTyping && (e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setState((s) => ({ ...s, zen: !s.zen }));
        return;
      }

      // Esc → exit zen mode
      if (e.key === "Escape" && state.zen) {
        e.preventDefault();
        setState((s) => ({ ...s, zen: false }));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [outlineAvailable, state.zen]);

  const toggleOutline = () =>
    setState((s) => ({ ...s, outlineOpen: !s.outlineOpen }));
  const toggleChunk = () =>
    setState((s) => ({ ...s, chunkOpen: !s.chunkOpen }));
  const toggleZen = () =>
    setState((s) => ({ ...s, zen: !s.zen }));

  const showOutline = outlineAvailable && state.outlineOpen && !state.zen;
  const showChunk = state.chunkOpen && !state.zen;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <AnimatePresence>
        {!state.zen && (
          <motion.div
            key="viewer-header"
            initial={{ y: -56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -56, opacity: 0 }}
            transition={spring.gentle}
            className="relative z-20"
          >
            {header}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body: three panes */}
      <div className="relative flex flex-1 min-h-0">
        {/* ─── Left outline panel ─── */}
        <AnimatePresence initial={false}>
          {showOutline && (
            <motion.aside
              key="outline-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={spring.gentle}
              className="shrink-0 overflow-hidden border-r border-border bg-card"
            >
              <div className="h-full w-64 overflow-y-auto">
                {outline}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ─── Middle: document ─── */}
        <div className="relative flex flex-1 min-w-0 bg-muted/20">
          {children}

          {/* Floating panel toggles (only when not in zen mode) */}
          {!state.zen && (
            <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-start justify-between px-2 pt-3">
              {outlineAvailable && !showOutline && (
                <Tooltip content={<span>Outline <Kbd>⌘B</Kbd></span>} side="right">
                  <button
                    onClick={toggleOutline}
                    className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-r-lg border border-l-0 border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-[var(--shadow-sm)]"
                    aria-label="Show outline"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
              <div className="pointer-events-none flex-1" />
              {!showChunk && (
                <Tooltip content={<span>Highlighted passage <Kbd>⌘.</Kbd></span>} side="left">
                  <button
                    onClick={toggleChunk}
                    className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-l-lg border border-r-0 border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-[var(--shadow-sm)]"
                    aria-label="Show chunk panel"
                  >
                    <PanelRightOpen className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
            </div>
          )}

          {/* Zen mode exit button */}
          {state.zen && (
            <Tooltip content={<span>Exit zen mode <Kbd>F</Kbd></span>} side="left">
              <button
                onClick={toggleZen}
                className="pointer-events-auto absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-[var(--shadow-lg)] hover:bg-muted hover:text-foreground transition-colors z-30"
                aria-label="Exit zen mode"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </Tooltip>
          )}

          {/* Zen mode enter button (floats when panels are hidden) */}
          {!state.zen && (
            <Tooltip content={<span>Zen mode <Kbd>F</Kbd></span>} side="left">
              <button
                onClick={toggleZen}
                className="pointer-events-auto absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 backdrop-blur text-muted-foreground opacity-0 hover:opacity-100 hover:bg-card focus-visible:opacity-100 transition-all z-10"
                style={{ opacity: showChunk ? undefined : 1 }}
                aria-label="Enter zen mode"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          )}
        </div>

        {/* ─── Right chunk panel ─── */}
        <AnimatePresence initial={false}>
          {showChunk && (
            <motion.aside
              key="chunk-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 340, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={spring.gentle}
              className="shrink-0 overflow-hidden border-l border-border bg-card"
            >
              <div className="flex h-full w-[340px] flex-col">
                {chunk}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Panel close buttons when open — live on the panel edges */}
        {showOutline && (
          <button
            onClick={toggleOutline}
            className={cn(
              "absolute top-3 z-10 flex h-8 w-5 items-center justify-center",
              "rounded-r-lg border border-l-0 border-border bg-card text-muted-foreground",
              "hover:bg-muted hover:text-foreground transition-colors shadow-[var(--shadow-sm)]"
            )}
            style={{ left: 256 }}
            aria-label="Hide outline"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
        {showChunk && (
          <button
            onClick={toggleChunk}
            className={cn(
              "absolute top-3 z-10 flex h-8 w-5 items-center justify-center",
              "rounded-l-lg border border-r-0 border-border bg-card text-muted-foreground",
              "hover:bg-muted hover:text-foreground transition-colors shadow-[var(--shadow-sm)]"
            )}
            style={{ right: 340 }}
            aria-label="Hide chunk panel"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
