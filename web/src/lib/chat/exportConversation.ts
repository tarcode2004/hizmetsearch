/**
 * Convert a chat conversation into a Markdown document and trigger a
 * browser download. Used by the "Export" button in `ChatContainer`.
 */
import type { ChunkResult, Message } from "@/lib/types";

export function conversationToMarkdown(
  title: string,
  messages: Message[]
): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(
    `_Exported from HizmetSearch — ${new Date().toLocaleString()}_`
  );
  lines.push("");

  // Collect a global numbered bibliography from any sources cited
  const bibliography: ChunkResult[] = [];
  const sourceIndex = new Map<string, number>();
  for (const msg of messages) {
    for (const src of msg.sources ?? []) {
      if (!sourceIndex.has(src.chunk_id)) {
        sourceIndex.set(src.chunk_id, bibliography.length + 1);
        bibliography.push(src);
      }
    }
  }

  // Render messages
  for (const msg of messages) {
    lines.push("---");
    lines.push("");
    if (msg.role === "user") {
      lines.push(`### You`);
    } else {
      const modelLabel =
        msg.model === "claude" ? "Claude · Precision" : "Gemini · Exploration";
      lines.push(`### Assistant — ${modelLabel}`);
    }
    lines.push("");

    // Rewrite [N] markers to global bibliography numbers
    let content = msg.content ?? "";
    if (msg.sources && msg.sources.length > 0) {
      content = content.replace(/\[(\d+)\]/g, (_match, n: string) => {
        const localIdx = parseInt(n, 10) - 1;
        const src = msg.sources?.[localIdx];
        if (!src) return `[${n}]`;
        const globalIdx = sourceIndex.get(src.chunk_id);
        return globalIdx ? `[${globalIdx}]` : `[${n}]`;
      });
    }
    lines.push(content);
    lines.push("");
  }

  // Bibliography
  if (bibliography.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Sources");
    lines.push("");
    bibliography.forEach((src, i) => {
      const num = i + 1;
      const author = src.author_speaker
        ? ` — ${src.author_speaker}`
        : "";
      const locationBits: string[] = [];
      if (src.chapter_section) locationBits.push(src.chapter_section);
      if (src.page_number != null) locationBits.push(`p. ${src.page_number}`);
      if (src.timestamp_start != null) {
        const m = Math.floor(src.timestamp_start / 60);
        const s = Math.floor(src.timestamp_start % 60).toString().padStart(2, "0");
        locationBits.push(`${m}:${s}`);
      }
      const location =
        locationBits.length > 0 ? ` (${locationBits.join(", ")})` : "";
      lines.push(`${num}. **${src.title}**${author}${location}`);
      const excerpt = (src.text ?? "").slice(0, 280).trim();
      if (excerpt) {
        lines.push(`   > ${excerpt.replace(/\n/g, " ")}${src.text.length > 280 ? "…" : ""}`);
      }
      lines.push("");
    });
  }

  return lines.join("\n");
}

export function downloadConversation(title: string, messages: Message[]) {
  const md = conversationToMarkdown(title, messages);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "conversation";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeTitle}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
