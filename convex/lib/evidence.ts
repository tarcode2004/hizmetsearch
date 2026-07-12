/**
 * Server-owned evidence primitives for research citations.
 *
 * This module is deliberately pure: later tickets may attach it to tool
 * responses and persistence without giving the model authority over source
 * identity, location, or quoted text.
 */

export type EvidenceLocator = {
  passageStart?: number;
  passageEnd?: number;
  pageStart?: number;
  pageEnd?: number;
  timestampStart?: number;
};

export type EvidenceMetadata = {
  docId: string;
  title: string;
  author?: string;
  collection?: string;
  language?: string;
  sourceType?: string;
};

export type EvidenceRecord = EvidenceMetadata & {
  id: string;
  runId: string;
  locator: EvidenceLocator;
  excerpt: string;
  sourceText: string;
  sourceTextHash: string;
};

export type CitationValidationError =
  | { code: "unknown_evidence"; id: string }
  | { code: "cross_run_evidence"; id: string }
  | { code: "unlisted_evidence"; id: string }
  | { code: "unused_evidence"; id: string }
  | { code: "quote_not_in_evidence"; quote: string; id?: string };

/** Normalization is intentionally conservative: it accepts normal Turkish
 * typography/line wrapping differences without concealing altered words. */
export function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

function hashText(value: string): string {
  // Stable non-cryptographic audit fingerprint. It detects accidental
  // mismatches; source text itself remains the authority for validation.
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class EvidenceLedger {
  private records = new Map<string, EvidenceRecord>();
  private sequence = 0;

  constructor(readonly runId: string) {}

  register(input: EvidenceMetadata & {
    locator: EvidenceLocator;
    excerpt: string;
    sourceText: string;
  }): EvidenceRecord {
    const excerpt = input.excerpt.trim();
    if (!excerpt || !normalizeEvidenceText(input.sourceText).includes(normalizeEvidenceText(excerpt))) {
      throw new Error("Evidence excerpt must be an exact substring of the read response");
    }
    const id = `ev_${String(++this.sequence).padStart(2, "0")}`;
    const record: EvidenceRecord = {
      ...input,
      id,
      runId: this.runId,
      excerpt,
      sourceTextHash: hashText(input.sourceText),
    };
    this.records.set(id, record);
    return record;
  }

  get(id: string): EvidenceRecord | undefined {
    return this.records.get(id);
  }

  values(): EvidenceRecord[] {
    return [...this.records.values()];
  }
}

/** Parse only the internal markers expected from the final synthesis. */
export function evidenceIdsInAnswer(answer: string): string[] {
  return [...answer.matchAll(/\[\^((?:ev_)[A-Za-z0-9_-]+)\]/g)].map((match) => match[1]);
}

const EVIDENCE_USED_RE = /\n?\s*\{\s*"evidence_used"\s*:\s*(\[[^\]]*\])\s*\}\s*$/;

/** Pull the required final protocol line off the user-visible answer. */
export function extractEvidenceUsedBlock(raw: string): { display: string; evidenceUsed: string[] } | null {
  const match = raw.match(EVIDENCE_USED_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) return null;
    return { display: raw.slice(0, match.index).trimEnd(), evidenceUsed: parsed };
  } catch {
    return null;
  }
}

/** Convert internal markers to stable display numbers in order of first use. */
export function numberEvidenceMarkers(answer: string): { display: string; ids: string[] } {
  const ids: string[] = [];
  const display = answer.replace(/\[\^((?:ev_)[A-Za-z0-9_-]+)\]/g, (_match, id: string) => {
    let index = ids.indexOf(id);
    if (index === -1) {
      ids.push(id);
      index = ids.length - 1;
    }
    return `[${index + 1}]`;
  });
  return { display, ids };
}

/** Extract direct quotes paired immediately with their evidence marker. */
export function citedQuotesInAnswer(answer: string): Array<{ quote: string; id?: string }> {
  const matches = answer.matchAll(/["“]([^"”]{1,500})["”]\s*(?:\[\^((?:ev_)[A-Za-z0-9_-]+)\])?/g);
  return [...matches].map((match) => ({ quote: match[1], id: match[2] }));
}

export function validateEvidenceUsage(args: {
  answer: string;
  evidenceUsed: string[];
  ledger: EvidenceLedger;
}): CitationValidationError[] {
  const errors: CitationValidationError[] = [];
  const cited = evidenceIdsInAnswer(args.answer);
  const listed = new Set(args.evidenceUsed);

  for (const id of new Set(cited)) {
    const evidence = args.ledger.get(id);
    if (!evidence) {
      errors.push({ code: "unknown_evidence", id });
    } else if (evidence.runId !== args.ledger.runId) {
      errors.push({ code: "cross_run_evidence", id });
    }
    if (!listed.has(id)) errors.push({ code: "unlisted_evidence", id });
  }
  for (const id of listed) {
    if (!cited.includes(id)) errors.push({ code: "unused_evidence", id });
    if (!args.ledger.get(id)) errors.push({ code: "unknown_evidence", id });
  }
  for (const { quote, id } of citedQuotesInAnswer(args.answer)) {
    const evidence = id ? args.ledger.get(id) : undefined;
    if (!evidence || !normalizeEvidenceText(evidence.sourceText).includes(normalizeEvidenceText(quote))) {
      errors.push({ code: "quote_not_in_evidence", quote, ...(id ? { id } : {}) });
    }
  }
  return errors;
}
