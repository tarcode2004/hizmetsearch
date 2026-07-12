import { useSyncExternalStore } from "react";

export type CitationHighlightLevel = "none" | "source" | "strong";

export interface CitationHighlight {
  messageId: string | null;
  sourceNumber: number | null;
  level: CitationHighlightLevel;
}

const EMPTY: CitationHighlight = {
  messageId: null,
  sourceNumber: null,
  level: "none",
};

let current = EMPTY;
let publishTimer: ReturnType<typeof setTimeout> | undefined;
let clearTimer: ReturnType<typeof setTimeout> | undefined;
let strongTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit(next: CitationHighlight) {
  current = next;
  listeners.forEach((listener) => listener());
}

/**
 * A tiny external store intentionally sits outside the markdown tree.
 * Citation hover only repaints chips/source excerpts; it never causes an
 * answer's ReactMarkdown subtree to be rendered again.
 */
export const citationHighlightStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => current,
  hover(messageId: string, sourceNumber: number, level: Exclude<CitationHighlightLevel, "none">) {
    if (clearTimer) clearTimeout(clearTimer);
    if (publishTimer) clearTimeout(publishTimer);
    if (strongTimer) clearTimeout(strongTimer);

    const delay = level === "strong" ? 200 : 90;
    const timer = setTimeout(() => {
      emit({ messageId, sourceNumber, level });
    }, delay);
    if (level === "strong") strongTimer = timer;
    else publishTimer = timer;
  },
  clear(messageId: string, sourceNumber: number) {
    if (publishTimer) clearTimeout(publishTimer);
    if (strongTimer) clearTimeout(strongTimer);
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      if (current.messageId === messageId && current.sourceNumber === sourceNumber) {
        emit(EMPTY);
      }
    }, 60);
  },
};

export function useCitationHighlight(): CitationHighlight {
  return useSyncExternalStore(
    citationHighlightStore.subscribe,
    citationHighlightStore.getSnapshot,
    citationHighlightStore.getSnapshot,
  );
}

export interface CitationColor {
  bg: string;
  border: string;
  text: string;
}

// Eight deliberately distinct hues. Assignment is stable by citation number,
// so the same source reads as the same colour across chip, source row and quote.
const SOURCE_COLORS: CitationColor[] = [
  { bg: "#E8F3EE", border: "#2F7D62", text: "#14503C" },
  { bg: "#EDF1FA", border: "#5871B8", text: "#304A8C" },
  { bg: "#F8EDE3", border: "#B96D3B", text: "#7D3E1D" },
  { bg: "#F4EAF4", border: "#94609A", text: "#643A6A" },
  { bg: "#E8F3F4", border: "#39838B", text: "#1C5960" },
  { bg: "#F7F0E0", border: "#A67B27", text: "#72520F" },
  { bg: "#F2ECE7", border: "#8A6250", text: "#5D3D2F" },
  { bg: "#EDF1E5", border: "#6E8A43", text: "#455C27" },
];

export function colorForCitation(sourceNumber: number): CitationColor {
  return SOURCE_COLORS[(Math.max(1, sourceNumber) - 1) % SOURCE_COLORS.length];
}

/** Opaque hex blend, used instead of alpha overlays so nested surfaces agree. */
export function blendHex(from: string, to: string, amount: number): string {
  const a = from.slice(1);
  const b = to.slice(1);
  const channels = [0, 2, 4].map((offset) => {
    const x = parseInt(a.slice(offset, offset + 2), 16);
    const y = parseInt(b.slice(offset, offset + 2), 16);
    return Math.round(x + (y - x) * amount).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function citationPaint(
  messageId: string | undefined,
  sourceNumber: number,
  highlight: CitationHighlight,
): { backgroundColor?: string; borderColor?: string; color?: string; textShadow?: string } {
  const color = colorForCitation(sourceNumber);
  const active = highlight.messageId === messageId && highlight.sourceNumber === sourceNumber;
  if (!active) return {};
  if (highlight.level === "strong") {
    return {
      backgroundColor: blendHex(color.bg, color.border, 0.15),
      borderColor: color.border,
      color: color.text,
      textShadow: "0 0 0.7px currentColor, 0 0 0.7px currentColor",
    };
  }
  return {
    backgroundColor: blendHex(color.bg, "#ffffff", 0.35),
    borderColor: color.border,
    color: color.text,
  };
}
