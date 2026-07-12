import { describe, expect, it } from "vitest";
import {
  EvidenceLedger,
  normalizeEvidenceText,
  validateEvidenceUsage,
} from "../lib/evidence";

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
