import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { containsCitationPlaceholder } from "@/lib/citations";
import type { ChunkResult, Message } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

// FeedbackWidget talks to Convex (useMutation) — out of scope here.
vi.mock("@/components/shared/FeedbackWidget", () => ({
  FeedbackWidget: () => null,
}));

/** Source fixture shaped exactly like T4's persisted research sources
 *  (convex/actions/chat.ts extractResearchSources): synthetic
 *  `research:{doc_id}:{n}` chunk ids, quote in `text`, composed locator
 *  in `chapter_section`, passage_start/_end, and NO source_url. */
function researchSource(over: Partial<ChunkResult>): ChunkResult {
  return {
    chunk_id: "research:doc_rhd1:1",
    doc_id: "doc_rhd1",
    text: "Yeryüzü mirasçılarının vasıfları hakkında alıntılanan bölüm.",
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

const SOURCES: ChunkResult[] = [
  researchSource({}),
  // The observed duplicate-edition artifact: junk trailing separator.
  researchSource({
    chunk_id: "research:doc_rhd1_dup:2",
    doc_id: "doc_rhd1_dup",
    title: "RHD-1 -",
    chapter_section: "s. 40",
    page_number: 40,
    passage_start: 9,
    passage_end: 9,
  }),
  // Same work as [1], different locator — merge case.
  researchSource({
    chunk_id: "research:doc_rhd1:3",
    chapter_section: "s. 90 · §22",
    page_number: 90,
    passage_start: 22,
    passage_end: 22,
  }),
];

/** Exercises every documented citation form (§2 of
 *  docs/RANKING_AND_CHUNKING_PLAN.md) inside every node type that used
 *  to leak NOGLYPH: unhandled headings (h4-h6), inline code, links,
 *  em/strong nesting, list items, and blockquotes. */
const CONTENT = [
  "Intro **bold [1]** and *em with **nested [2]** runs* plus `code [3]`.",
  "",
  "#### Alt başlık [1]",
  "",
  "##### Beşinci [2]",
  "",
  "- Adjacent [1][2] in a list",
  "- Ranged [1-3] and list [1, 2]",
  "",
  "> Quoted [Source 1] and [Sources 2, 3]",
  "",
  "A [link](https://example.com) followed by [Kaynak 2].",
].join("\n");

function makeMessage(over: Partial<Message>): Message {
  return {
    _id: "msg1",
    conversationId: "conv1",
    role: "assistant",
    content: CONTENT,
    model: "claude",
    sources: SOURCES,
    isStreaming: false,
    researchSteps: [
      {
        tool: "search_corpus",
        inputSummary: "yeryüzü mirasçıları",
        resultCount: 8,
        ts: 1,
      },
      {
        tool: "read_document",
        inputSummary: "Ruhumuzun Heykelini Dikerken-1",
        resultCount: 3,
        ts: 2,
      },
    ],
    createdAt: Date.now(),
    ...over,
  };
}

function renderBubble(message: Message) {
  return render(
    <I18nProvider>
      <MessageBubble message={message} />
    </I18nProvider>,
  );
}

describe("MessageBubble citations (T4 research-source format)", () => {
  it("discloses when finalization omitted unsupported statements", () => {
    const { getByRole } = renderBubble(makeMessage({ citationIntegrity: "partial" }));
    expect(getByRole("status").textContent).toMatch(/omitted.*did not verify/i);
  });
  it("renders no citation placeholders (NOGLYPH) for any documented form", () => {
    const { container } = renderBubble(makeMessage({}));
    expect(containsCitationPlaceholder(container.textContent ?? "")).toBe(
      false,
    );
    // And no literal bracket forms survive either.
    expect(container.textContent).not.toMatch(/\[\d/);
    expect(container.textContent).not.toMatch(/\[Source/i);
    expect(container.textContent).not.toMatch(/\[Kaynak/i);
  });

  it("renders chips for citations inside previously-leaking node types", () => {
    const { container, getAllByLabelText } = renderBubble(makeMessage({}));
    // Chips exist for all three source numbers.
    expect(getAllByLabelText("Citation 1").length).toBeGreaterThan(0);
    expect(getAllByLabelText("Citation 2").length).toBeGreaterThan(0);
    expect(getAllByLabelText("Citation 3").length).toBeGreaterThan(0);
    // Specifically inside the h4/h5 fallthrough handlers and code.
    expect(container.querySelector("h4 .citation-chip")).not.toBeNull();
    expect(container.querySelector("h5 .citation-chip")).not.toBeNull();
    expect(container.querySelector("code .citation-chip")).not.toBeNull();
    expect(container.querySelector("strong .citation-chip")).not.toBeNull();
    expect(container.querySelector("blockquote .citation-chip")).not.toBeNull();
    expect(container.querySelector("li .citation-chip")).not.toBeNull();
  });

  it("links chips to the source viewer carrying the passage locator", () => {
    const { getAllByLabelText } = renderBubble(makeMessage({}));
    const chip = getAllByLabelText("Citation 1")[0] as HTMLAnchorElement;
    expect(chip.getAttribute("href")).toContain("/source/doc_rhd1");
    expect(chip.getAttribute("href")).toContain("ps=3");
    expect(chip.getAttribute("href")).toContain("pe=5");
  });

  it("shows the research timeline and chips together", () => {
    const { container, getAllByText } = renderBubble(makeMessage({}));
    expect(getAllByText(/Researched/).length).toBeGreaterThan(0);
    expect(getAllByText(/tool calls/).length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".citation-chip").length).toBeGreaterThan(
      0,
    );
  });

  it("merges same-doc source rows and cleans junk titles in the source list", () => {
    const { container } = renderBubble(makeMessage({}));
    // Open the sources expander (its button reads "3 sources" / "3 kaynak").
    const expander = Array.from(container.querySelectorAll("button")).find(
      (b) => /^3 (sources|kaynak)/.test((b.textContent ?? "").trim()),
    );
    expect(expander).toBeTruthy();
    fireEvent.click(expander!);
    // Entries 1 and 3 cite the same doc — one merged row + the dup row.
    // (Inline chips are also /source/ anchors; rows carry the `group` class.)
    const rows = container.querySelectorAll('a.group[href*="/source/"]');
    expect(rows.length).toBe(2);
    const rowTexts = Array.from(rows).map((r) => r.textContent ?? "");
    const merged = rowTexts.find((t) => t.includes("Ruhumuzun"));
    expect(merged).toBeTruthy();
    // Merged row carries both citation numbers and both locators.
    expect(merged).toContain("s. 12–15 · §3–5");
    expect(merged).toContain("s. 90 · §22");
    // Junk "RHD-1 -" title is cleaned for display.
    const dup = rowTexts.find((t) => t.includes("RHD-1"));
    expect(dup).toBeTruthy();
    expect(dup).not.toContain("RHD-1 -");
  });

  it("keeps a leaking-free DOM while streaming with a live timeline", () => {
    const { container, getByText } = renderBubble(
      makeMessage({
        isStreaming: true,
        researchStatus: "Reading Ruhumuzun Heykelini Dikerken-1…",
        content: "Partial answer so far [1] and [2]",
      }),
    );
    expect(getByText(/Researching/)).toBeTruthy();
    expect(containsCitationPlaceholder(container.textContent ?? "")).toBe(
      false,
    );
  });
});
