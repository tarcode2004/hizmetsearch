"""Char-window arithmetic for /tools/read_document.

A work's readable text is the ordered concatenation of its passages,
joined by a two-char separator ("\n\n"). Passages can be huge (Gemini
audio transcripts reach ~200KB), so read_document slices this virtual
concatenation by [char_offset, char_offset + char_limit) without ever
materializing the whole thing. This module does the pure arithmetic:
which passages intersect the window, and which sub-slice of each.

Kept dependency-free so it can be unit-tested without psycopg/FastAPI.
"""

from __future__ import annotations

from typing import Optional

SEPARATOR = "\n\n"


def compute_read_window(
    lengths: list[int],
    char_offset: int,
    char_limit: int,
    sep_len: int = len(SEPARATOR),
) -> tuple[list[tuple[int, int, int]], int, Optional[int]]:
    """Slice the virtual concatenation of passages by a char window.

    Args:
        lengths: per-passage char lengths, in reading order.
        char_offset: global offset into the concatenation (>= 0).
        char_limit: max chars to cover (window size).
        sep_len: chars consumed by the separator between passages.

    Returns:
        (slices, total_chars, next_char_offset) where
        slices — [(passage_index, start_in_passage, end_in_passage), ...]
            for every passage that overlaps the window (end exclusive);
        total_chars — length of the full virtual concatenation;
        next_char_offset — global offset to continue reading from, or
            None when the window reaches the end of the text.
    """
    n = len(lengths)
    total = sum(lengths) + sep_len * max(0, n - 1)
    if char_offset >= total or char_limit <= 0:
        return [], total, None

    win_start = max(0, char_offset)
    win_end = min(total, char_offset + char_limit)

    slices: list[tuple[int, int, int]] = []
    global_start = 0  # global offset where the current passage begins
    for i, length in enumerate(lengths):
        global_end = global_start + length
        if global_end > win_start and global_start < win_end:
            s = max(0, win_start - global_start)
            e = min(length, win_end - global_start)
            if e > s:
                slices.append((i, s, e))
        global_start = global_end + sep_len
        if global_start >= win_end:
            break

    next_offset = win_end if win_end < total else None
    return slices, total, next_offset
