"""Unit tests for the read_document char-window arithmetic."""
from __future__ import annotations

import sys
from pathlib import Path

_API_DIR = Path(__file__).resolve().parents[1]
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from app.textwindow import compute_read_window  # noqa: E402


def test_whole_doc_fits():
    slices, total, nxt = compute_read_window([10, 20, 30], 0, 1000)
    assert total == 10 + 20 + 30 + 2 * 2
    assert slices == [(0, 0, 10), (1, 0, 20), (2, 0, 30)]
    assert nxt is None


def test_window_smaller_than_doc():
    # 10 + sep(2) + 20 + sep(2) + 30 = 64 total; window [0, 15)
    slices, total, nxt = compute_read_window([10, 20, 30], 0, 15)
    assert total == 64
    # passage 0 fully (0-10), separator 10-12, passage 1 chars 0-3
    assert slices == [(0, 0, 10), (1, 0, 3)]
    assert nxt == 15


def test_offset_into_middle_passage():
    slices, total, nxt = compute_read_window([10, 20, 30], 14, 10)
    # global 14 = passage1 char 2; window [14, 24) → passage1 chars 2-12
    assert slices == [(1, 2, 12)]
    assert nxt == 24


def test_offset_spans_separator_only():
    # window entirely inside the separator between p0 and p1 → no slices
    slices, total, nxt = compute_read_window([10, 20], 10, 2)
    assert slices == []
    assert nxt == 12


def test_offset_past_end():
    slices, total, nxt = compute_read_window([10, 20], 100, 10)
    assert slices == []
    assert nxt is None


def test_last_window_has_no_next():
    slices, total, nxt = compute_read_window([10, 20], 20, 1000)
    assert slices == [(1, 8, 20)]
    assert nxt is None


def test_huge_single_passage_paginates():
    # one 200KB passage read in 20K windows
    lengths = [200_000]
    offset = 0
    seen = 0
    for _ in range(20):
        slices, total, nxt = compute_read_window(lengths, offset, 20_000)
        assert total == 200_000
        for _, s, e in slices:
            seen += e - s
        if nxt is None:
            break
        offset = nxt
    assert seen == 200_000


def test_empty_doc():
    slices, total, nxt = compute_read_window([], 0, 100)
    assert slices == [] and total == 0 and nxt is None
