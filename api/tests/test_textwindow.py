"""Unit tests for the read_document char-window arithmetic."""
from __future__ import annotations

import sys
from pathlib import Path

_API_DIR = Path(__file__).resolve().parents[1]
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from app.textwindow import SEPARATOR, compute_read_window  # noqa: E402


def stitch(texts: list[str], slices, leading_sep: bool, trailing_sep: bool) -> str:
    """Mirror of the read_document stitcher in app/routes/tools.py."""
    parts: list[str] = []
    if leading_sep:
        parts.append(SEPARATOR)
    prev = None
    for idx, s, e in slices:
        if prev is not None:
            parts.append(SEPARATOR)
        parts.append(texts[idx][s:e])
        prev = idx
    if trailing_sep:
        parts.append(SEPARATOR)
    return "".join(parts)


def read_all(texts: list[str], char_limit: int, max_iters: int = 10_000) -> str:
    """Sequentially page through the whole doc via next_char_offset."""
    lengths = [len(t) for t in texts]
    out: list[str] = []
    offset = 0
    for _ in range(max_iters):
        slices, _total, nxt, lead, trail = compute_read_window(
            lengths, offset, char_limit
        )
        out.append(stitch(texts, slices, lead, trail))
        if nxt is None:
            return "".join(out)
        assert nxt > offset, "next_char_offset must make progress"
        offset = nxt
    raise AssertionError("pagination did not terminate")


def test_whole_doc_fits():
    slices, total, nxt, lead, trail = compute_read_window([10, 20, 30], 0, 1000)
    assert total == 10 + 20 + 30 + 2 * 2
    assert slices == [(0, 0, 10), (1, 0, 20), (2, 0, 30)]
    assert nxt is None
    assert not lead and not trail


def test_window_smaller_than_doc():
    # 10 + sep(2) + 20 + sep(2) + 30 = 64 total; window [0, 15)
    slices, total, nxt, lead, trail = compute_read_window([10, 20, 30], 0, 15)
    assert total == 64
    # passage 0 fully (0-10), separator 10-12, passage 1 chars 0-3
    assert slices == [(0, 0, 10), (1, 0, 3)]
    assert nxt == 15
    assert not lead and not trail


def test_offset_into_middle_passage():
    slices, total, nxt, lead, trail = compute_read_window([10, 20, 30], 14, 10)
    # global 14 = passage1 char 2; window [14, 24) → passage1 chars 2-12
    assert slices == [(1, 2, 12)]
    assert nxt == 24
    assert not lead and not trail


def test_offset_spans_separator_only():
    # window entirely inside the separator between p0 and p1 → no passage
    # slices, but the separator itself must be emitted (leading_sep).
    slices, total, nxt, lead, trail = compute_read_window([10, 20], 10, 2)
    assert slices == []
    assert nxt == 12
    assert lead and not trail


def test_offset_past_end():
    slices, total, nxt, lead, trail = compute_read_window([10, 20], 100, 10)
    assert slices == []
    assert nxt is None
    assert not lead and not trail


def test_last_window_has_no_next():
    slices, total, nxt, lead, trail = compute_read_window([10, 20], 20, 1000)
    assert slices == [(1, 8, 20)]
    assert nxt is None
    assert not lead and not trail


def test_huge_single_passage_paginates():
    # one 200KB passage read in 20K windows
    lengths = [200_000]
    offset = 0
    seen = 0
    for _ in range(20):
        slices, total, nxt, _lead, _trail = compute_read_window(
            lengths, offset, 20_000
        )
        assert total == 200_000
        for _, s, e in slices:
            seen += e - s
        if nxt is None:
            break
        offset = nxt
    assert seen == 200_000


def test_empty_doc():
    slices, total, nxt, lead, trail = compute_read_window([], 0, 100)
    assert slices == [] and total == 0 and nxt is None
    assert not lead and not trail


# ── Window-boundary separator behavior (review C1) ────────────────────────


def test_boundary_exactly_at_passage_end_keeps_separator():
    # Window A ends exactly at the end of p0 → emits p0, no separator;
    # window B resumes at the separator start and must emit it (leading).
    slices_a, _t, nxt_a, lead_a, trail_a = compute_read_window([10, 20], 0, 10)
    assert slices_a == [(0, 0, 10)] and not lead_a and not trail_a
    assert nxt_a == 10
    slices_b, _t, nxt_b, lead_b, _trail_b = compute_read_window([10, 20], nxt_a, 100)
    assert lead_b
    assert slices_b == [(1, 0, 20)]
    assert nxt_b is None


def test_boundary_inside_separator_snaps_past_it():
    # Window A's end bisects the separator → snapped past it and the
    # separator is emitted as trailing; window B resumes at p1.
    slices_a, _t, nxt_a, lead_a, trail_a = compute_read_window([10, 20], 0, 11)
    assert slices_a == [(0, 0, 10)] and not lead_a and trail_a
    assert nxt_a == 12
    slices_b, _t, _n, lead_b, _tr = compute_read_window([10, 20], nxt_a, 100)
    assert not lead_b
    assert slices_b == [(1, 0, 20)]


def test_boundary_covering_full_separator_emits_it():
    # Window A covers p0 + the full separator → trailing separator.
    slices_a, _t, nxt_a, _lead, trail_a = compute_read_window([10, 20], 0, 12)
    assert slices_a == [(0, 0, 10)] and trail_a
    assert nxt_a == 12


def test_client_offset_inside_separator_snaps_down():
    # An arbitrary caller offset bisecting the separator snaps down to
    # the separator start, so the full separator is still emitted once.
    slices, _t, _n, lead, _tr = compute_read_window([10, 20], 11, 100)
    assert lead
    assert slices == [(1, 0, 20)]


def test_stitching_property_sequential_windows_concatenate_losslessly():
    """THE invariant: for any window size, paging the whole doc through
    next_char_offset and concatenating the stitched windows reproduces
    the full separator-joined text exactly."""
    texts = ["alpha", "hi", "o", "a longer passage here", "tail"]
    full = SEPARATOR.join(texts)
    for char_limit in list(range(1, 26)) + [40, 1000]:
        assert read_all(texts, char_limit) == full, f"char_limit={char_limit}"


def test_stitching_property_various_shapes():
    cases = [
        ["x"],
        ["x", "y"],
        ["", "abc"],  # leading empty passage
        ["abcdef" * 7, "q", "rstuv" * 3],
        ["p" * 41, "q" * 13, "r" * 29, "s" * 7],
    ]
    for texts in cases:
        full = SEPARATOR.join(texts)
        for char_limit in [1, 2, 3, 5, 8, 13, 21, 100]:
            assert read_all(texts, char_limit) == full, (texts, char_limit)
