import type { ChunkResult } from "@/lib/types";

/**
 * Build the `/source/:docId?chunk=:chunkId` URL for opening a chunk in the viewer.
 *
 * We pass the chunk metadata via URL params so the viewer can render without
 * a round-trip to the server — critical for fast new-tab opens.
 */
export function buildSourceViewerUrl(chunk: ChunkResult): string {
  const params = new URLSearchParams();
  params.set("chunk", chunk.chunk_id);
  if (chunk.source_url) params.set("src", chunk.source_url);
  if (chunk.source_ext) params.set("ext", chunk.source_ext);
  if (chunk.source_type) params.set("type", chunk.source_type);
  if (chunk.page_number != null) params.set("page", String(chunk.page_number));
  if (chunk.timestamp_start != null)
    params.set("ts", String(chunk.timestamp_start));
  if (chunk.timestamp_end != null)
    params.set("te", String(chunk.timestamp_end));
  if (chunk.char_offset != null)
    params.set("off", String(chunk.char_offset));
  // Research-agent locator (passage-ordering range within the work).
  if (chunk.passage_start != null)
    params.set("ps", String(chunk.passage_start));
  if (chunk.passage_end != null) params.set("pe", String(chunk.passage_end));
  if (chunk.title) params.set("title", chunk.title);
  if (chunk.author_speaker) params.set("author", chunk.author_speaker);
  if (chunk.chapter_section) params.set("section", chunk.chapter_section);
  if (chunk.collection) params.set("col", chunk.collection);
  if (chunk.language) params.set("lang", chunk.language);
  // The highlighted text itself — keep first 500 chars to fit in URL
  if (chunk.text) params.set("q", chunk.text.slice(0, 500));

  return `/source/${chunk.doc_id}?${params.toString()}`;
}

/**
 * Parse the R2 source URL into a list of human-readable path segments
 * (decoded, slashes split, the host stripped). Used by the viewer
 * header to render a folder breadcrumb so a user staring at
 * "HKEOMIX2834.flv" can see e.g. "Audio → Bediüzzaman Konferansları →
 * 2018 → HKEOMIX2834.flv" and understand what they're looking at.
 *
 * Returns an empty array on any parse error.
 */
export function parseSourcePathTrail(sourceUrl: string | null | undefined): string[] {
  if (!sourceUrl) return [];
  try {
    const u = new URL(sourceUrl);
    return u.pathname
      .split("/")
      .filter((s) => s.length > 0)
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      });
  } catch {
    // Not a parseable URL — fall back to splitting on / directly.
    return sourceUrl
      .split("/")
      .filter((s) => s.length > 0 && !s.includes(":"));
  }
}

/** Determine which viewer component to render from type + extension. */
export function getViewerKind(
  sourceType: string | null | undefined,
  ext: string | null | undefined
): "pdf" | "html" | "audio" | "video" | "unknown" {
  if (sourceType === "audio" || ext === "mp3" || ext === "m4a" || ext === "wav")
    return "audio";
  if (sourceType === "video" || ext === "mp4" || ext === "webm" || ext === "mov")
    return "video";
  if (ext === "pdf") return "pdf";
  if (ext === "html" || ext === "htm" || ext === "docx" || ext === "epub")
    return "html";
  if (sourceType === "text" || sourceType === "scanned") return "pdf";
  return "unknown";
}
