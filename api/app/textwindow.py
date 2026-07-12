"""Char-window arithmetic for /tools/read_document.

A work's readable text is the ordered concatenation of its passages,
joined by a two-char separator ("\n\n"). Passages can be huge (Gemini
audio transcripts reach ~200KB), so read_document slices this virtual
concatenation by [char_offset, char_offset + char_limit) without ever
materializing the whole thing. This module does the pure arithmetic:
which passages intersect the window, which sub-slice of each, and which
boundary separators the stitcher must emit.

Separator invariant: a window never bisects a separator (bounds are
snapped outward — the start down to the separator's start, the end up
past it), and every separator the window covers is emitted by exactly
one window. Sequential reads chained through `next_char_offset`
therefore concatenate losslessly to the full joined text.

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
) -> tuple[list[tuple[int, int, int]], int, Optional[int], bool, bool]:
    """Slice the virtual concatenation of passages by a char window.

    Args:
        lengths: per-passage char lengths, in reading order.
        char_offset: global offset into the concatenation (>= 0).
        char_limit: max chars to cover (window size).
        sep_len: chars consumed by the separator between passages.

    Returns:
        (slices, total_chars, next_char_offset, leading_sep, trailing_sep)
        slices — [(passage_index, start_in_passage, end_in_passage), ...]
            for every passage that overlaps the window (end exclusive);
        total_chars — length of the full virtual concatenation;
        next_char_offset — global offset to continue reading from, or
            None when the window reaches the end of the text. Never
            lands strictly inside a separator (the window end snaps
            past a separator it would otherwise bisect, so the emitted
            text may exceed char_limit by up to sep_len chars);
        leading_sep — the window starts on a separator it covers: the
            stitcher must emit one separator before the first slice;
        trailing_sep — the window ends just past a separator that
            follows its last slice: the stitcher must emit one
            separator after the last slice.
    """
    n = len(lengths)
    total = sum(lengths) + sep_len * max(0, n - 1)
    if char_offset >= total or char_limit <= 0:
        return [], total, None, False, False

    win_start = max(0, char_offset)
    win_end = min(total, char_offset + char_limit)

    # ends[i] — global offset just past passage i; the separator after
    # passage i (i < n-1) occupies [ends[i], ends[i] + sep_len).
    ends: list[int] = []
    pos = 0
    for i, length in enumerate(lengths):
        pos += length
        ends.append(pos)
        pos += sep_len

    # Snap the window so it never bisects a separator: a start strictly
    # inside one moves DOWN to the separator's start (the caller re-reads
    # at most sep_len chars); an end strictly inside one moves UP past it.
    for i in range(n - 1):
        sep_a = ends[i]
        sep_b = sep_a + sep_len
        if sep_a < win_start < sep_b:
            win_start = sep_a
        if sep_a < win_end < sep_b:
            win_end = sep_b

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

    # Boundary separators the window covers but the pairwise stitcher
    # (which only joins ADJACENT slices) would drop:
    #  - leading: the window starts exactly on a separator (the previous
    #    window ended at the preceding passage's end);
    #  - trailing: the window ends exactly past a separator that follows
    #    its last slice (the boundary landed on/inside the separator and
    #    was snapped past it).
    leading_sep = any(win_start == ends[i] for i in range(n - 1))
    trailing_sep = bool(slices) and any(
        win_end == ends[i] + sep_len and slices[-1][0] == i
        for i in range(n - 1)
    )

    next_offset = win_end if win_end < total else None
    return slices, total, next_offset, leading_sep, trailing_sep
