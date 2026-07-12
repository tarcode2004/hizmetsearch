import { describe, expect, it } from "vitest";
import {
  EvidenceLedger,
  extractEvidenceUsedBlock,
  normalizeEvidenceText,
  numberEvidenceMarkers,
  validateEvidenceUsage,
} from "../lib/evidence";
import { executeResearchTool, type DocRegistry } from "../lib/agentTools";

function ledger() {
  const result = new EvidenceLedger("research-run-a");
  result.register({
    docId: "sozler-23",
    title: "Sözler",
    author: "Bediüzzaman Said Nursî",
    language: "tr",
    locator: { passageStart: 10, passageEnd: 11 },
    excerpt: "iki yüksek dağ var, birbirine bakıyor",
    sourceText: "Hayalî bir vakada gördüm ki, iki yüksek dağ var, birbirine bakıyor. Aralarında dehşetli bir köprü kurulmuş.",
  });
  return result;
}

describe("EvidenceLedger", () => {
  it("only registers exact excerpts from a read response", () => {
    const source = ledger().get("ev_01")!;
    expect(source.sourceTextHash).toHaveLength(8);
    expect(() => new EvidenceLedger("x").register({
      docId: "bad", title: "Bad", locator: {}, excerpt: "uydurma", sourceText: "başka metin",
    })).toThrow(/exact substring/);
  });

  it("normalizes Turkish typography and whitespace, not word changes", () => {
    expect(normalizeEvidenceText("Hayalî  bir\nVAKA")).toBe("hayalî bir vaka");
    expect(normalizeEvidenceText("köprü")).not.toBe(normalizeEvidenceText("uçurum"));
  });
});

describe("validateEvidenceUsage", () => {
  it("accepts an exact quote with a listed ledger citation", () => {
    expect(validateEvidenceUsage({
      answer: 'Metin “iki yüksek dağ var, birbirine bakıyor” [^ev_01]',
      evidenceUsed: ["ev_01"], ledger: ledger(),
    })).toEqual([]);
  });

  it("rejects fabricated ids, altered quotes, and mismatched source lists", () => {
    const errors = validateEvidenceUsage({
      answer: '“iki yüksek dağ ve ejderhalar vardır” [^ev_99]',
      evidenceUsed: ["ev_01"], ledger: ledger(),
    });
    expect(errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "unknown_evidence", "unlisted_evidence", "unused_evidence", "quote_not_in_evidence",
    ]));
  });

  it("rejects evidence from a different research run", () => {
    const first = ledger();
    const second = new EvidenceLedger("research-run-b");
    // Deliberately emulate a leaked ledger record by reusing an ID lookup;
    // the validator must be robust if its backing record has a foreign run.
    const foreign = first.get("ev_01")!;
    const originalGet = second.get.bind(second);
    second.get = ((id: string) => id === "ev_01" ? foreign : originalGet(id));
    expect(validateEvidenceUsage({
      answer: "Claim [^ev_01]", evidenceUsed: ["ev_01"], ledger: second,
    }).map((error) => error.code)).toContain("cross_run_evidence");
  });
});

describe("tool evidence boundary", () => {
  it("creates evidence only from read_document responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      doc_id: "sozler-23", title: "Sözler", author_speaker: "Said Nursî",
      source_type: "text", range_start_passage: 10, range_end_passage: 11,
      passages: [{ ordering: 10 }], text: "iki yüksek dağ var, birbirine bakıyor",
    }), { status: 200 })) as typeof fetch;
    try {
      const evidence = new EvidenceLedger("run");
      const registry: DocRegistry = new Map();
      const result = await executeResearchTool("https://tools.test", "key", "read_document", { doc_id: "sozler-23" }, registry, evidence);
      expect(result.isError).toBe(false);
      expect(result.resultText).toContain('"evidence_id":"ev_01"');
      expect(evidence.get("ev_01")?.docId).toBe("sozler-23");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("final evidence protocol", () => {
  it("strips the machine evidence block and numbers internal markers", () => {
    const parsed = extractEvidenceUsedBlock('Claim [^ev_02] and [^ev_01]\n{"evidence_used":["ev_02","ev_01"]}');
    expect(parsed).toEqual({ display: "Claim [^ev_02] and [^ev_01]", evidenceUsed: ["ev_02", "ev_01"] });
    expect(numberEvidenceMarkers(parsed!.display)).toEqual({ display: "Claim [1] and [2]", ids: ["ev_02", "ev_01"] });
  });
});
