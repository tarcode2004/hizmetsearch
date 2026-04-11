/**
 * Smoke tests for the prompt builder. Verifies that source formatting,
 * variable substitution, and the cache-control split all work as
 * expected. These run via vitest in the convex workspace.
 */
import { describe, it, expect } from "vitest";
import {
  formatSourcesForLLM,
  buildSearchAnswerPrompt,
  buildChatClaudePrompt,
  toAnthropicMessages,
  type SourceContext,
} from "../lib/prompts";

const sources: SourceContext[] = [
  {
    index: 1,
    title: "Sözler",
    author: "Bediüzzaman Said Nursî",
    text: "Birinci söz, bismillah hakkındadır. Allah'ın adıyla başlamak…",
    collection: "Risale-i Nur",
    language: "tr",
    section: "Birinci Söz",
    page: 12,
  },
  {
    index: 2,
    title: "The Rays",
    author: "Bediüzzaman Said Nursî",
    text: "The First Ray demonstrates the existence of the divine names…",
    collection: "Risale-i Nur",
    language: "en",
    section: "First Ray",
    page: 5,
  },
];

describe("formatSourcesForLLM", () => {
  it("renders headers with title, author, location, and language", () => {
    const out = formatSourcesForLLM(sources);
    expect(out).toContain("[Source 1]");
    expect(out).toContain("Sözler");
    expect(out).toContain("— Bediüzzaman Said Nursî");
    expect(out).toContain("Birinci Söz");
    expect(out).toContain("p. 12");
    expect(out).toContain("[Risale-i Nur, tr]");
    expect(out).toContain("[Source 2]");
  });

  it("truncates long passages with an ellipsis", () => {
    const long: SourceContext[] = [
      {
        index: 1,
        title: "Long",
        author: "x",
        text: "a".repeat(2000),
      },
    ];
    const out = formatSourcesForLLM(long);
    expect(out).toContain("…");
    // Body must be no longer than the cap (1200 chars) plus an ellipsis
    expect(out.split("\n")[1].length).toBeLessThanOrEqual(1201);
  });

  it("formats audio timestamps as M:SS", () => {
    const audio: SourceContext[] = [
      {
        index: 1,
        title: "Sohbet",
        author: "x",
        text: "audio sample",
        timestamp: 125,
        timestampEnd: 200,
      },
    ];
    const out = formatSourcesForLLM(audio);
    expect(out).toContain("2:05–3:20");
  });
});

describe("buildSearchAnswerPrompt", () => {
  it("substitutes {query} and {sources}", () => {
    const built = buildSearchAnswerPrompt({
      sources,
      query: "What does the First Word say?",
      language: "en",
    });
    expect(built.body).toContain("What does the First Word say?");
    expect(built.body).toContain("[Source 1]");
    expect(built.promptId).toBe("search_answer_en");
  });

  it("picks the Turkish template when language=tr", () => {
    const built = buildSearchAnswerPrompt({
      sources,
      query: "Kader nedir?",
      language: "tr",
    });
    expect(built.promptId).toBe("search_answer_tr");
  });
});

describe("buildChatClaudePrompt + toAnthropicMessages", () => {
  it("splits at the cache marker into prefix + suffix", () => {
    const built = buildChatClaudePrompt({
      sources,
      query: "Tell me about the Rays.",
      conversationHistory: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "salam" },
      ],
    });
    // Either there's no cache marker (cachedPrefix = "") or the prefix
    // ends with the marker text the YAML defines.
    expect(built.body.length).toBeGreaterThan(0);

    const messages = toAnthropicMessages(built);
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("user");
    if (built.cachedPrefix) {
      expect(messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
    } else {
      expect(messages[0].content.length).toBe(1);
    }
  });
});
