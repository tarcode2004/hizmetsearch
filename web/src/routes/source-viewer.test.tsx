import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { ChunkResult } from "@/lib/types";
import { buildSourceViewerUrl } from "@/lib/source-viewer";
import { SourceViewerPage } from "./source-viewer";

// The real viewers pull in pdf.js / media elements — irrelevant to the
// citation-fallback path under test.
vi.mock("@/components/viewer/PdfViewer", () => ({
  PdfViewer: () => null,
  extractPdfMetadata: vi.fn(async () => null),
  findPageWithText: vi.fn(async () => null),
}));
vi.mock("@/components/viewer/TextViewer", () => ({ TextViewer: () => null }));
vi.mock("@/components/viewer/AudioViewer", () => ({ AudioViewer: () => null }));
vi.mock("@/components/viewer/VideoViewer", () => ({ VideoViewer: () => null }));

/** T4 research source: no source_url. */
const RESEARCH_SOURCE: ChunkResult = {
  chunk_id: "research:doc_rhd1:1",
  doc_id: "doc_rhd1",
  text: "Yeryüzü mirasçılarının vasıfları hakkında alıntılanan bölüm.",
  parent_text: null,
  source_type: "text",
  language: "tr",
  collection: "pirlanta",
  title: "RHD-1 -",
  author_speaker: "M. Fethullah Gülen",
  publisher: "Nil",
  chapter_section: "s. 12–15 · §3–5",
  page_number: 12,
  timestamp_start: null,
  timestamp_end: null,
  passage_start: 3,
  passage_end: 5,
};

function renderViewerAt(url: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/source/:docId" element={<SourceViewerPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("SourceViewerPage citation fallback", () => {
  it("renders citation details (not NotFound) for research sources without a file", () => {
    const url = buildSourceViewerUrl(RESEARCH_SOURCE);
    expect(url).toContain("/source/doc_rhd1");
    expect(url).toContain("ps=3");
    const { container, getByText } = renderViewerAt(url);
    // Cleaned title, author, locator, and the quoted passage all render.
    expect(getByText("RHD-1")).toBeTruthy();
    expect(getByText("M. Fethullah Gülen")).toBeTruthy();
    expect(getByText(/s\. 12–15 · §3–5/)).toBeTruthy();
    expect(
      getByText(/Yeryüzü mirasçılarının vasıfları hakkında/),
    ).toBeTruthy();
    // And it is NOT the dead not-found screen.
    expect(container.textContent).not.toMatch(
      /Source not found|Kaynak bulunamadı/,
    );
  });

  it("still shows NotFound when there is no citation payload at all", () => {
    const { container } = renderViewerAt("/source/doc_x");
    expect(container.textContent).toMatch(
      /Source not found|Kaynak bulunamadı/,
    );
  });
});
