"""Normalized substring location inside passage text.

Backs /tools/locate_passage: given a retrieval chunk's text, find where it
sits inside ONE work so the viewer can read the surrounding text. The chunk
was cut from this very corpus, but whitespace (line wrapping), curly vs
straight quotes, and casing may differ — so both sides are normalized the
same way, while an index map from the normalized haystack back to raw
offsets keeps the result usable for char-window reads.

Turkish casing: under a non-Turkish locale lower('İ') is 'i' + U+0307 and
lower('I') is 'i' (not 'ı'), so the İ/I/ı triple is folded to plain 'i'
BEFORE lowercasing on both sides (same trick as routes.tools._tr_fold).

Kept dependency-free so it can be unit-tested without psycopg/FastAPI.
"""

from __future__ import annotations

import unicodedata
from typing import Optional

_FOLD = {
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "İ": "i",
    "I": "i",
    "ı": "i",
}

# Probe prefix lengths to try, longest first — a chunk's tail may differ
# (ellipses on research excerpts, OCR fixes) while its head still matches.
_PROBE_LENGTHS = (600, 300, 180, 100, 60)
_MIN_PROBE = 40


def _fold_char(ch: str) -> str:
    ch = unicodedata.normalize("NFKC", ch)
    return "".join(_FOLD.get(c, c) for c in ch).lower()


def normalize_probe(value: str) -> str:
    """Whole-string normalization; must agree with the per-char walk in
    `_normalize_with_map`."""
    folded = "".join(_fold_char(c) for c in value)
    return " ".join(folded.split())


def _normalize_with_map(haystack: str) -> tuple[str, list[int]]:
    """Normalized haystack + per-char map back to raw offsets."""
    chars: list[str] = []
    idx_map: list[int] = []
    pending_space = False
    for i, ch in enumerate(haystack):
        if ch.isspace():
            pending_space = bool(chars)
            continue
        if pending_space:
            chars.append(" ")
            idx_map.append(i)
            pending_space = False
        for c in _fold_char(ch):
            chars.append(c)
            idx_map.append(i)
    return "".join(chars), idx_map


def find_normalized(haystack: str, probe_norm: str) -> Optional[int]:
    """Raw index into `haystack` where the normalized probe begins, or
    None. `probe_norm` must already be `normalize_probe`d."""
    if not probe_norm:
        return None
    norm, idx_map = _normalize_with_map(haystack)
    pos = norm.find(probe_norm)
    return idx_map[pos] if pos >= 0 else None


def locate_in_text(haystack: str, chunk_text: str) -> Optional[int]:
    """Find the chunk inside a passage, trying progressively shorter
    probe prefixes. Returns the raw haystack offset of the match."""
    full = normalize_probe(chunk_text)
    if not full:
        return None
    norm, idx_map = _normalize_with_map(haystack)
    if len(full) < _MIN_PROBE:
        pos = norm.find(full)
        return idx_map[pos] if pos >= 0 else None
    for length in _PROBE_LENGTHS:
        if length > len(full):
            continue
        pos = norm.find(full[:length])
        if pos >= 0:
            return idx_map[pos]
    return None
