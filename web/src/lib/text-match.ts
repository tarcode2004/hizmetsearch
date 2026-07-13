/**
 * Normalized substring matching that maps back to original string indices.
 *
 * The corpus text a chunk was cut from and the chunk text itself differ in
 * whitespace (line wrapping), curly vs straight quotes, and casing. To
 * highlight a chunk inside a larger window of work text we normalize both
 * sides the same way the server does (convex/lib/evidence.ts), but keep a
 * per-character map from the normalized haystack back to original indices
 * so the highlight lands on the raw text.
 */

function normalizeChar(ch: string): string {
  return ch
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLocaleLowerCase("tr-TR");
}

/** Whole-string normalization — must agree with the per-char pass below. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

/**
 * Find `needle` inside `haystack` under normalization, returning the range
 * in ORIGINAL haystack coordinates ([start, end) suitable for slicing).
 *
 * Falls back to progressively shorter needle prefixes (a chunk's tail may
 * cross the window edge, or differ after OCR fixes) before giving up.
 */
export function findNormalizedRange(
  haystack: string,
  needle: string,
): { start: number; end: number } | null {
  // Build normalized haystack + index map in one pass.
  const normChars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < haystack.length; i++) {
    const raw = haystack[i];
    if (/\s/.test(raw)) {
      pendingSpace = normChars.length > 0;
      continue;
    }
    if (pendingSpace) {
      normChars.push(" ");
      map.push(i);
      pendingSpace = false;
    }
    const n = normalizeChar(raw);
    for (const c of n) {
      normChars.push(c);
      map.push(i);
    }
  }
  const norm = normChars.join("");

  const fullNeedle = normalizeForMatch(needle);
  for (const len of [fullNeedle.length, 300, 180, 100, 60]) {
    if (len > fullNeedle.length || len < 40) continue;
    const probe = fullNeedle.slice(0, len);
    const idx = norm.indexOf(probe);
    if (idx !== -1) {
      return { start: map[idx], end: map[idx + probe.length - 1] + 1 };
    }
  }
  // Very short chunks: try the whole needle even below the 40-char floor.
  if (fullNeedle.length > 0 && fullNeedle.length < 40) {
    const idx = norm.indexOf(fullNeedle);
    if (idx !== -1) {
      return { start: map[idx], end: map[idx + fullNeedle.length - 1] + 1 };
    }
  }
  return null;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Expand a highlight range outward to word boundaries. Chunks are cut by
 * char windows and can start/end mid-word ("ECOND SUBTLETY…"); a highlight
 * that severs a word reads like a rendering bug.
 */
export function snapToWordBounds(
  text: string,
  range: { start: number; end: number },
): { start: number; end: number } {
  let { start, end } = range;
  while (start > 0 && WORD_CHAR.test(text[start - 1]) && WORD_CHAR.test(text[start])) {
    start--;
  }
  while (end < text.length && WORD_CHAR.test(text[end]) && WORD_CHAR.test(text[end - 1])) {
    end++;
  }
  return { start, end };
}
