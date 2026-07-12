import { describe, expect, it } from "vitest";
import {
  CITE_OPEN,
  CITE_CLOSE,
  cleanSourceTitle,
  containsCitationPlaceholder,
  expandRangeOrList,
  formatSourceLocator,
  mergeSourceEntries,
  preprocessCitations,
  resolveSourceDisplay,
} from "./citations";
import type { ChunkResult } from "./types";

const chip = (n: number) => `${CITE_OPEN}${n}${CITE_CLOSE}`;

describe("preprocessCitations", () => {
  it("handles the single form [1]", () => {
    expect(preprocessCitations("fact [1].")).toBe(`fact ${chip(1)}.`);
  });

  it("handles adjacent [1][2]", () => {
    expect(preprocessCitations("fact [1][2].")).toBe(
      `fact ${chip(1)}${chip(2)}.`,
    );
  });

  it("expands ranges [1-3] including en/em dashes", () => {
    expect(preprocessCitations("fact [1-3].")).toBe(
      `fact ${chip(1)}${chip(2)}${chip(3)}.`,
    );
    expect(preprocessCitations("fact [4–5].")).toBe(
      `fact ${chip(4)}${chip(5)}.`,
    );
  });

  it("expands comma lists [1, 2, 3]", () => {
    expect(preprocessCitations("fact [1, 2, 3].")).toBe(
      `fact ${chip(1)}${chip(2)}${chip(3)}.`,
    );
  });

  it("normalizes prose forms [Source 1] / [Sources 1, 2] / [Kaynak 3]", () => {
    expect(preprocessCitations("fact [Source 1].")).toBe(`fact ${chip(1)}.`);
    expect(preprocessCitations("fact [Sources 1, 2].")).toBe(
      `fact ${chip(1)}${chip(2)}.`,
    );
    expect(preprocessCitations("fact [Kaynak 3].")).toBe(`fact ${chip(3)}.`);
    expect(preprocessCitations("fact [Kaynaklar 1-2].")).toBe(
      `fact ${chip(1)}${chip(2)}.`,
    );
  });

  it("leaves regular markdown links and non-citation brackets alone", () => {
    expect(preprocessCitations("see [the docs](https://x)")).toBe(
      "see [the docs](https://x)",
    );
    expect(preprocessCitations("array[abc] and [not a citation]")).toBe(
      "array[abc] and [not a citation]",
    );
  });
});

describe("expandRangeOrList", () => {
  it("ignores inverted and absurd ranges", () => {
    expect(expandRangeOrList("9-3")).toEqual([]);
    expect(expandRangeOrList("1-99")).toEqual([]);
  });

  it("mixes ranges and singles in one list", () => {
    expect(expandRangeOrList("1-2, 5")).toEqual([1, 2, 5]);
  });
});

describe("cleanSourceTitle", () => {
  it("strips the observed duplicate-edition junk suffix", () => {
    expect(cleanSourceTitle("RHD-1 -")).toBe("RHD-1");
  });

  it("collapses whitespace and trailing separators", () => {
    expect(cleanSourceTitle("  Sözler  · ")).toBe("Sözler");
    expect(cleanSourceTitle("Şualar,")).toBe("Şualar");
  });

  it("keeps normal titles untouched", () => {
    expect(cleanSourceTitle("Ruhumuzun Heykelini Dikerken-1")).toBe(
      "Ruhumuzun Heykelini Dikerken-1",
    );
  });
});

function researchSource(over: Partial<ChunkResult>): ChunkResult {
  return {
    chunk_id: "research:doc_a:1",
    doc_id: "doc_a",
    text: "quoted passage",
    parent_text: null,
    source_type: "text",
    language: "tr",
    collection: "pirlanta",
    title: "Ruhumuzun Heykelini Dikerken-1",
    author_speaker: "M. Fethullah Gülen",
    publisher: "Nil",
    chapter_section: "s. 12–15 · §3–5",
    page_number: 12,
    timestamp_start: null,
    timestamp_end: null,
    passage_start: 3,
    passage_end: 5,
    ...over,
  };
}

describe("formatSourceLocator", () => {
  it("uses the composed locator for research sources without doubling the page", () => {
    const bits = formatSourceLocator(researchSource({}));
    expect(bits).toEqual(["s. 12–15 · §3–5"]);
  });

  it("falls back to passage range, then timestamp, for research sources", () => {
    expect(
      formatSourceLocator(
        researchSource({ chapter_section: "", page_number: null }),
      ),
    ).toEqual(["§3–5"]);
    expect(
      formatSourceLocator(
        researchSource({
          chapter_section: "",
          page_number: null,
          passage_start: null,
          passage_end: null,
          timestamp_start: 125,
        }),
      ),
    ).toEqual(["2:05"]);
  });

  it("keeps classic chunk behavior (chapter + page)", () => {
    const classic = researchSource({
      chunk_id: "qdrant-chunk-1",
      chapter_section: "Birinci Söz",
      page_number: 7,
    });
    expect(formatSourceLocator(classic)).toEqual(["Birinci Söz", "p. 7"]);
  });
});

describe("mergeSourceEntries / resolveSourceDisplay", () => {
  const s1 = researchSource({});
  const s2 = researchSource({
    chunk_id: "research:doc_b:2",
    doc_id: "doc_b",
    title: "RHD-1 -",
    author_speaker: "",
    chapter_section: "s. 40",
    page_number: 40,
  });
  const s3 = researchSource({
    chunk_id: "research:doc_a:3",
    chapter_section: "s. 90 · §22",
    page_number: 90,
    passage_start: 22,
    passage_end: 22,
  });

  it("merges research entries sharing a doc_id and unions locators", () => {
    const merged = mergeSourceEntries([s1, s2, s3]);
    expect(merged).toHaveLength(2);
    expect(merged[0].numbers).toEqual([1, 3]);
    expect(merged[0].locators).toEqual(["s. 12–15 · §3–5", "s. 90 · §22"]);
    expect(merged[1].numbers).toEqual([2]);
  });

  it("never merges classic retrieval chunks from the same work", () => {
    const c1 = researchSource({ chunk_id: "chunk-1" });
    const c2 = researchSource({ chunk_id: "chunk-2" });
    expect(mergeSourceEntries([c1, c2])).toHaveLength(2);
  });

  it("backfills missing metadata from a same-doc sibling", () => {
    const bare = researchSource({
      chunk_id: "research:doc_a:2",
      title: "",
      author_speaker: "",
    });
    const resolved = resolveSourceDisplay([s1, bare], 2);
    expect(resolved?.title).toBe("Ruhumuzun Heykelini Dikerken-1");
    expect(resolved?.author_speaker).toBe("M. Fethullah Gülen");
  });
});

describe("containsCitationPlaceholder", () => {
  it("detects leftover placeholders", () => {
    expect(containsCitationPlaceholder(`x${chip(1)}y`)).toBe(true);
    expect(containsCitationPlaceholder("clean text [1]")).toBe(false);
  });
});
