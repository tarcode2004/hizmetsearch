import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blendHex,
  citationHighlightStore,
  citationPaint,
} from "./citationHighlights";

afterEach(() => {
  vi.useRealTimers();
});

describe("citation highlight store", () => {
  it("coalesces source hover at 90ms and clears it at 60ms", () => {
    vi.useFakeTimers();
    citationHighlightStore.hover("message-1", 2, "source");
    expect(citationHighlightStore.getSnapshot().level).toBe("none");
    vi.advanceTimersByTime(89);
    expect(citationHighlightStore.getSnapshot().level).toBe("none");
    vi.advanceTimersByTime(1);
    expect(citationHighlightStore.getSnapshot()).toMatchObject({
      messageId: "message-1",
      sourceNumber: 2,
      level: "source",
    });
    citationHighlightStore.clear("message-1", 2);
    vi.advanceTimersByTime(60);
    expect(citationHighlightStore.getSnapshot().level).toBe("none");
  });

  it("delays strong chip emphasis and paints it without changing font weight", () => {
    vi.useFakeTimers();
    citationHighlightStore.hover("message-2", 1, "strong");
    vi.advanceTimersByTime(199);
    expect(citationHighlightStore.getSnapshot().level).toBe("none");
    vi.advanceTimersByTime(1);
    const active = citationHighlightStore.getSnapshot();
    const paint = citationPaint("message-2", 1, active);
    expect(paint.textShadow).toContain("currentColor");
    expect(paint).not.toHaveProperty("fontWeight");
  });

  it("uses deterministic opaque blending", () => {
    expect(blendHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});
