import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { containsCitationPlaceholder } from "@/lib/citations";
import type { SearchResult } from "@/lib/types";
import { AIAnswer } from "./AIAnswer";

vi.mock("@/components/shared/FeedbackWidget", () => ({
  FeedbackWidget: () => null,
}));
vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
}));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { isAuthenticated: false } }),
}));
vi.mock("@/lib/observability", () => ({
  captureError: vi.fn(),
}));

/** Classic retrieval source (search pipeline) — has a real source_url. */
function searchResult(n: number): SearchResult {
  return {
    chunk: {
      chunk_id: `chunk-${n}`,
      doc_id: `doc-${n}`,
      text: `Passage ${n} text`,
      parent_text: null,
      source_type: "text",
      language: "tr",
      collection: "pirlanta",
      title: `Work ${n}`,
      author_speaker: "Author",
      publisher: "Nil",
      chapter_section: "",
      page_number: n * 10,
      timestamp_start: null,
      timestamp_end: null,
      source_url: `https://cdn.example.com/works/work-${n}.pdf`,
      source_ext: "pdf",
    },
    score: 0.9,
    rerank_score: null,
  };
}

const SOURCES = [searchResult(1), searchResult(2), searchResult(3)];

const CONTENT = [
  "Answer opening **with [1]** and *emphasis [2]*.",
  "",
  "#### Deep heading [3]",
  "",
  "1. Ordered [1][2]",
  "2. Ranged [1-3]",
  "",
  "> Blockquote [Source 2]",
  "",
  "Inline `code [1]` and prose [Sources 1, 3].",
].join("\n");

function renderAnswer(answer: string) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AIAnswer answer={answer} sources={SOURCES} query="test query" />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("AIAnswer citations", () => {
  it("renders no citation placeholders (NOGLYPH) for any documented form", () => {
    const { container } = renderAnswer(CONTENT);
    expect(containsCitationPlaceholder(container.textContent ?? "")).toBe(
      false,
    );
    expect(container.textContent).not.toMatch(/\[\d/);
    expect(container.textContent).not.toMatch(/\[Source/i);
  });

  it("renders chips inside previously-leaking node types (h4, code)", () => {
    const { container } = renderAnswer(CONTENT);
    expect(container.querySelector("h4 .citation-chip")).not.toBeNull();
    expect(container.querySelector("code .citation-chip")).not.toBeNull();
    expect(container.querySelector("blockquote .citation-chip")).not.toBeNull();
    expect(container.querySelector("li .citation-chip")).not.toBeNull();
  });

  it("links chips to the source viewer with the page locator", () => {
    const { getAllByLabelText } = renderAnswer(CONTENT);
    const chip = getAllByLabelText("Citation 1")[0] as HTMLAnchorElement;
    const href = chip.getAttribute("href") ?? "";
    expect(href).toContain("/source/doc-1");
    expect(href).toContain("page=10");
    expect(href).toContain("src=");
  });

  it("survives a streaming partial answer without leaking placeholders", () => {
    const { container } = render(
      <MemoryRouter>
        <I18nProvider>
          <AIAnswer
            answer={"Partial [1] and [2"}
            sources={SOURCES}
            isStreaming
          />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(containsCitationPlaceholder(container.textContent ?? "")).toBe(
      false,
    );
  });
});
