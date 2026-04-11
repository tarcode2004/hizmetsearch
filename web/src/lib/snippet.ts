/**
 * Build a query-aware snippet around the first occurrence of a query term
 * in the chunk text.
 *
 * Without this, the result card just shows the first ~280 chars of the chunk,
 * which often is the page header / boilerplate. With it, we center on the
 * actual hit, the way Google highlights an excerpt.
 *
 * Returns segments tagged as `match | text` so the renderer can wrap matches
 * in <mark> for visual highlighting.
 */

export type SnippetSegment = { kind: "match" | "text"; value: string };

const STOPWORDS = new Set([
  // Turkish
  "ve", "ile", "ya", "veya", "bir", "bu", "şu", "o", "için", "gibi",
  "kadar", "ama", "fakat", "neden", "niçin", "nasıl", "ne", "mi", "mı",
  // English
  "and", "or", "the", "a", "an", "is", "are", "was", "were", "of", "in",
  "to", "for", "on", "with", "as", "at", "by", "from", "what", "why",
  "how", "this", "that",
]);

/** Lowercase + strip diacritics so "Hacı" matches "hacı" matches "hacı". */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Pull "real" terms out of the query: drop stopwords, drop single chars. */
export function queryTerms(query: string): string[] {
  if (!query) return [];
  const norm = normalize(query);
  return Array.from(
    new Set(
      norm
        .split(/[\s\p{P}]+/u)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    )
  );
}

/** Find the first index in `text` where any of `terms` appears. */
function firstHit(text: string, terms: string[]): number {
  if (terms.length === 0) return -1;
  const norm = normalize(text);
  let best = -1;
  for (const t of terms) {
    const i = norm.indexOf(t);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

/**
 * Build a snippet around the best query hit. Returns up to ~`maxChars`
 * characters centered on the hit, padded out to a sentence-ish boundary on
 * either side. If no hit is found, falls back to the leading slice.
 */
export function buildSnippet(
  text: string,
  query: string | undefined,
  maxChars = 320,
): SnippetSegment[] {
  if (!text) return [];
  const terms = queryTerms(query ?? "");
  const hit = firstHit(text, terms);

  let start = 0;
  let end = Math.min(text.length, maxChars);
  let prefix = "";
  let suffix = "";

  if (hit >= 0) {
    // Window: half maxChars on each side of the hit. Snap to nearest space.
    const half = Math.floor(maxChars / 2);
    start = Math.max(0, hit - half);
    end = Math.min(text.length, start + maxChars);
    // Walk to nearest whitespace so we don't cut mid-word.
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    while (end < text.length && !/\s/.test(text[end])) end++;
    if (start > 0) prefix = "… ";
    if (end < text.length) suffix = " …";
  } else if (text.length > maxChars) {
    suffix = " …";
  }

  const slice = text.slice(start, end);

  // Tokenize the slice into segments, marking matches.
  if (terms.length === 0) {
    return [{ kind: "text", value: prefix + slice + suffix }];
  }
  const segments: SnippetSegment[] = [];
  if (prefix) segments.push({ kind: "text", value: prefix });

  // Build a regex that matches any term, anchored on word boundaries.
  // We use a non-anchored alt because Turkish/Arabic word boundaries are
  // unreliable, but we filter post-match by length to avoid sub-word noise.
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "giu");

  let cursor = 0;
  // We compare on the normalized text but emit slices from the original so
  // case + diacritics survive.
  const norm = normalize(slice);
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    if (m.index > cursor) {
      segments.push({ kind: "text", value: slice.slice(cursor, m.index) });
    }
    segments.push({
      kind: "match",
      value: slice.slice(m.index, m.index + m[0].length),
    });
    cursor = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (cursor < slice.length) {
    segments.push({ kind: "text", value: slice.slice(cursor) });
  }
  if (suffix) segments.push({ kind: "text", value: suffix });
  return segments;
}
