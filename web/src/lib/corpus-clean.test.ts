import { describe, expect, it } from "vitest";
import { cleanCorpusArtifacts } from "./corpus-clean";
import { findNormalizedRange, snapToWordBounds } from "./text-match";

describe("cleanCorpusArtifacts", () => {
  it("rejoins '# '-marked extraction lines into flowing text", () => {
    const raw =
      "if your old parents were living in\n\n# misery in front of your eyes, " +
      "you would see death as a great blessing and life\n\n# as an unendurable pain.";
    expect(cleanCorpusArtifacts(raw)).toBe(
      "if your old parents were living in misery in front of your eyes, " +
        "you would see death as a great blessing and life as an unendurable pain.",
    );
  });

  it("repairs drop-cap splits across artifact breaks", () => {
    // Real sample shape from The Letters: "# F\n\n\nOURTH\n\n# :"
    const raw = "severity.\n\n# F\n\n\nOURTH\n\n# :\n\n# Sleep is a time of repose";
    expect(cleanCorpusArtifacts(raw)).toBe(
      "severity. FOURTH: Sleep is a time of repose",
    );
  });

  it("repairs drop-caps across a passage boundary", () => {
    // "# S" ends one passage, "ECOND SUBTLETY" begins the next.
    const raw = "manners.\n\n# S\n\nECOND SUBTLETY\n\n# :\n\n# Sufism is only a means.";
    expect(cleanCorpusArtifacts(raw)).toBe(
      "manners. SECOND SUBTLETY: Sufism is only a means.",
    );
  });

  it("leaves clean text untouched", () => {
    const clean =
      "Cömertlik, her şeyden önce mü'minin bir şiarıdır.\n\n" +
      "Mü'min, kardeşini kendi nefsine tercih eder.";
    expect(cleanCorpusArtifacts(clean)).toBe(clean);
  });

  it("handles Turkish capitals in drop-cap repair", () => {
    const raw = "başlık.\n\n# Ü\n\nÇÜNCÜ MESELE devam eder";
    expect(cleanCorpusArtifacts(raw)).toBe("başlık. ÜÇÜNCÜ MESELE devam eder");
  });

  it("full pipeline: mid-word chunk cut highlights whole words on repaired text", () => {
    // Window text with artifacts; the research excerpt was cut by a char
    // window right after the drop-cap "S", so its needle starts mid-word.
    const window =
      "good manners (products of inspiration).\n\n# Thus a\n\n# tariqa’s\n\n" +
      "# most important fundamental is following the Sunna.\n\n# S\n\n" +
      "ECOND SUBTLETY\n\n# :\n\n# Sufism is only a means. If it is taken " +
      "as the aim or end,\n\n# the Sharia’s commands are reduced to mere cer-";
    const excerpt =
      "ECOND SUBTLETY\n\n# :\n\n# Sufism is only a means. If it is taken as the aim or end,";

    const display = cleanCorpusArtifacts(window);
    // Fragments are gone from the reading view.
    expect(display).not.toContain("#");
    expect(display).toContain("SECOND SUBTLETY: Sufism is only a means.");

    const raw = findNormalizedRange(display, cleanCorpusArtifacts(excerpt));
    expect(raw).not.toBeNull();
    const hl = snapToWordBounds(display, raw!);
    // The snap pulls the severed drop-cap back in: highlight starts at
    // the full word, not "ECOND".
    expect(display.slice(hl.start, hl.end)).toMatch(/^SECOND SUBTLETY/);
  });
});
