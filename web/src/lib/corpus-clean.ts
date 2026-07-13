/**
 * Display-time repair of PDF-extraction artifacts in corpus passage text.
 *
 * ~200 works in the docstore (most of the Risale-i Nur translations and
 * Kelimeli editions) were ingested with two artifacts:
 *
 *  1. Every original PDF line arrives as "\n\n# <line>" — a line marker,
 *     NOT a paragraph break, so raw rendering shows one short fragment
 *     per line.
 *  2. Drop-cap first letters are severed from their word across those
 *     line breaks: "F\n\n\nOURTH", "# S\n\nECOND SUBTLETY".
 *
 * This module rejoins that into flowing text for the READING panels only —
 * the tool-server/API text is untouched (the research agent's evidence
 * validation depends on exact server text). All transforms are no-ops on
 * clean text, so it's safe to apply unconditionally.
 */

export function cleanCorpusArtifacts(text: string): string {
  let s = text;
  // 1. Line markers → flowing text. "\n+# " sequences are artificial
  //    line wraps from the PDF extraction, not paragraphs.
  s = s.replace(/[ \t]*\n+#[ \t]?/g, " ");
  // 2. Drop-cap repair: a lone capital letter split from its ALL-CAPS
  //    continuation by artifact line breaks → rejoin ("F\n\n\nOURTH").
  s = s.replace(/(^|\s)([A-ZÇĞİÖŞÜ])\n+([A-ZÇĞİÖŞÜ]{2,})/g, "$1$2$3");
  // 3. Marker removal leaves floating punctuation ("FOURTH :" → "FOURTH:").
  s = s.replace(/ +([:;,.!?])/g, "$1");
  // 4. Collapse leftover 3+ newline runs to a normal paragraph break.
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}
