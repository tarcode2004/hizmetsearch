"""Corpus tool endpoints for the agentic retrieval loop (ticket T3).

POST /tools/search_text      — ParadeDB BM25 lexical search over passages,
                               with per-passage hits + a work-level rollup
POST /tools/list_works       — catalog of canonical works (deduped)
POST /tools/get_work_outline — work metadata + passage map (the `sections`
                               table is nearly empty, so the map of
                               orderings/pages/previews stands in for a
                               chapter outline)
POST /tools/read_document    — sequential reading with char-budget
                               pagination (passages reach ~200KB)
POST /tools/search_corpus    — Qdrant hybrid semantic search (wraps the
                               existing retrieval pipeline)

All endpoints are POST/JSON and bearer-authed by the app-level middleware
in app.main. Postgres access is read-only.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.db import fetch_all
from app.deps import get_retrieval_pipeline
from app.routes.search import CATEGORY_SPECS, _chunk_to_response
from app.schemas import SearchResponse, SearchResultItem
from app.textwindow import SEPARATOR, compute_read_window

logger = logging.getLogger(__name__)
router = APIRouter()

# Hard cap on chars returned by read_document — Gemini-audio passages
# reach ~200KB, and tool results feed straight into model context.
MAX_READ_CHARS = 20_000

# BM25 candidate pool used for the work-level rollup in search_text.
ROLLUP_POOL = 500

# total_matches is counted up to this cap. Common Turkish words ("nedir",
# "ve", ...) in a ||| disjunction can match hundreds of thousands of
# passages; an exact count would blow the statement timeout for zero
# agent value.
COUNT_CAP = 10_000

# The BM25 index tokenizes `text` three ways (see deploy/docstore/
# bm25_indexes.sql): default = ICU + Turkish stemmer, plus aliased
# Arabic/English stemmed fields.
_LANG_FIELD = {
    None: "p.text",
    "tr": "p.text",
    "ar": "p.text::pdb.alias('text_ar')",
    "en": "p.text::pdb.alias('text_en')",
}


def _capture(request: Request, tool: str, elapsed_ms: float, **props) -> None:
    """Best-effort PostHog telemetry — never let analytics break a tool."""
    try:
        request.app.state.posthog.capture(
            distinct_id=request.headers.get("X-PostHog-Distinct-ID")
            or "hizmetsearch-api-server",
            event="tool_called",
            properties={"tool": tool, "elapsed_ms": round(elapsed_ms, 2), **props},
        )
    except Exception:  # noqa: BLE001
        logger.debug("posthog capture failed for %s", tool, exc_info=True)


# ── search_text ──────────────────────────────────────────────────────────


class SearchTextFilters(BaseModel):
    source_type: Optional[str] = None       # 'text' | 'audio' | ...
    collection: Optional[str] = None        # exact collection name
    author_prefix: Optional[str] = None     # substring match on author_speaker
    work_id: Optional[str] = None           # restrict to one work


class SearchTextRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    # Selects the stemmer field; default (None/'tr') is the Turkish-stemmed
    # primary field.
    language: Optional[str] = Field(default=None, pattern=r"^(tr|ar|en)$")
    filters: Optional[SearchTextFilters] = None
    mode: str = Field(default="match", pattern=r"^(match|phrase)$")
    limit: int = Field(default=10, ge=1, le=50)
    include_duplicates: bool = False


class PassageHit(BaseModel):
    passage_id: int
    work_id: str
    title: str
    author_speaker: str
    collection: str
    source_type: str
    ordering: int
    page_number: Optional[int] = None
    score: float
    snippet: str
    passage_chars: int


class WorkRollup(BaseModel):
    doc_id: str
    title: str
    author_speaker: str
    collection: str
    source_type: str
    ordering_confident: bool
    hit_count: int
    best_score: float


class SearchTextResponse(BaseModel):
    hits: list[PassageHit]
    # Work-level rollup over the top-ROLLUP_POOL passages by BM25 score —
    # the fast way to see WHICH works discuss the query without lecture
    # transcripts drowning everything (pair with filters.source_type).
    works: list[WorkRollup]
    # Exact up to COUNT_CAP; when total_matches_capped is true the real
    # total is larger.
    total_matches: int
    total_matches_capped: bool
    rollup_candidate_pool: int
    query: str
    mode: str
    language: Optional[str] = None
    elapsed_ms: float


def _search_text_where(body: SearchTextRequest) -> tuple[str, list]:
    field = _LANG_FIELD[body.language]
    op = "###" if body.mode == "phrase" else "|||"
    clauses = [f"{field} {op} %s"]
    params: list = [body.query]
    if not body.include_duplicates:
        clauses.append("w.canonical")
    f = body.filters or SearchTextFilters()
    if f.source_type:
        clauses.append("w.source_type = %s")
        params.append(f.source_type)
    if f.collection:
        clauses.append("w.collection = %s")
        params.append(f.collection)
    if f.author_prefix:
        clauses.append("w.author_speaker ILIKE %s")
        params.append(f"%{f.author_prefix}%")
    if f.work_id:
        clauses.append("p.work_id = %s")
        params.append(f.work_id)
    return " AND ".join(clauses), params


@router.post("/search_text", response_model=SearchTextResponse)
def search_text(request: Request, body: SearchTextRequest) -> SearchTextResponse:
    t0 = time.perf_counter()
    where, params = _search_text_where(body)

    # Phase 1: rank + metadata only. Per-row functions like pdb.snippet()
    # or length() are evaluated for EVERY match before the sort (the
    # works-join defeats pg_search's top-k pushdown), which took ~60s on a
    # 100K-match disjunction — so snippets are computed in a second query
    # restricted to the winning ids.
    hits_sql = f"""
        SELECT p.id AS passage_id, p.work_id, w.title, w.author_speaker,
               w.collection, w.source_type, p.ordering, p.page_number,
               pdb.score(p.id) AS score
        FROM passages p JOIN works w ON w.doc_id = p.work_id
        WHERE {where}
        ORDER BY pdb.score(p.id) DESC, p.id
        LIMIT %s
    """
    rollup_sql = f"""
        WITH cand AS (
            SELECT p.work_id, pdb.score(p.id) AS score
            FROM passages p JOIN works w ON w.doc_id = p.work_id
            WHERE {where}
            ORDER BY pdb.score(p.id) DESC
            LIMIT %s
        )
        SELECT c.work_id AS doc_id, w.title, w.author_speaker, w.collection,
               w.source_type, w.ordering_confident,
               count(*)::int AS hit_count, max(c.score) AS best_score
        FROM cand c JOIN works w ON w.doc_id = c.work_id
        GROUP BY 1, 2, 3, 4, 5, 6
        ORDER BY best_score DESC
        LIMIT 15
    """
    count_sql = f"""
        SELECT count(*) AS n FROM (
            SELECT 1
            FROM passages p JOIN works w ON w.doc_id = p.work_id
            WHERE {where}
            LIMIT %s
        ) capped
    """

    hits = fetch_all(hits_sql, (*params, body.limit))
    works = fetch_all(rollup_sql, (*params, ROLLUP_POOL))
    total = fetch_all(count_sql, (*params, COUNT_CAP))[0]["n"]

    # Phase 2: snippets + passage sizes for just the winning passages.
    # The BM25 predicate must be repeated so pdb.snippet() has its query
    # context; the id filter keeps evaluation to `limit` rows.
    if hits:
        field = _LANG_FIELD[body.language]
        op = "###" if body.mode == "phrase" else "|||"
        snippet_sql = f"""
            SELECT p.id AS passage_id,
                   -- snippet() highlights matches on the DEFAULT (Turkish)
                   -- field; for alias-field (ar/en) matches it returns
                   -- NULL, so fall back to a whitespace-collapsed prefix.
                   coalesce(
                       pdb.snippet(p.text),
                       left(regexp_replace(p.text, '\s+', ' ', 'g'), 300)
                   ) AS snippet,
                   length(p.text) AS passage_chars
            FROM passages p
            WHERE {field} {op} %s AND p.id = ANY(%s)
        """
        extras = {
            r["passage_id"]: r
            for r in fetch_all(
                snippet_sql, (body.query, [h["passage_id"] for h in hits])
            )
        }
        for h in hits:
            extra = extras.get(h["passage_id"])
            h["snippet"] = extra["snippet"] if extra else ""
            h["passage_chars"] = extra["passage_chars"] if extra else 0

    elapsed_ms = (time.perf_counter() - t0) * 1000
    _capture(
        request, "search_text", elapsed_ms,
        mode=body.mode, language=body.language,
        result_count=len(hits), total_matches=total,
    )
    return SearchTextResponse(
        hits=[PassageHit(**h) for h in hits],
        works=[WorkRollup(**w) for w in works],
        total_matches=total,
        total_matches_capped=total >= COUNT_CAP,
        rollup_candidate_pool=ROLLUP_POOL,
        query=body.query,
        mode=body.mode,
        language=body.language,
        elapsed_ms=round(elapsed_ms, 2),
    )


# ── list_works ───────────────────────────────────────────────────────────


class ListWorksFilters(BaseModel):
    author_prefix: Optional[str] = None
    collection: Optional[str] = None
    language: Optional[str] = None
    source_type: Optional[str] = None
    # BM25 match on the (Turkish-stemmed) title field; results come back
    # ranked by title relevance when set.
    title_match: Optional[str] = None


class ListWorksRequest(BaseModel):
    filters: Optional[ListWorksFilters] = None
    include_duplicates: bool = False
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class WorkSummary(BaseModel):
    doc_id: str
    title: str
    author_speaker: str
    publisher: str
    collection: str
    language: str
    source_type: str
    passage_count: int
    char_count: int
    ordering_confident: bool
    canonical: bool
    title_score: Optional[float] = None


class ListWorksResponse(BaseModel):
    works: list[WorkSummary]
    total: int
    limit: int
    offset: int
    elapsed_ms: float


@router.post("/list_works", response_model=ListWorksResponse)
def list_works(request: Request, body: ListWorksRequest) -> ListWorksResponse:
    t0 = time.perf_counter()
    f = body.filters or ListWorksFilters()

    clauses: list[str] = []
    params: list = []
    if not body.include_duplicates:
        clauses.append("w.canonical")
    if f.title_match:
        clauses.append("w.title ||| %s")
        params.append(f.title_match)
    if f.author_prefix:
        clauses.append("w.author_speaker ILIKE %s")
        params.append(f"%{f.author_prefix}%")
    if f.collection:
        clauses.append("w.collection = %s")
        params.append(f.collection)
    if f.language:
        clauses.append("w.language = %s")
        params.append(f.language)
    if f.source_type:
        clauses.append("w.source_type = %s")
        params.append(f.source_type)
    where = " AND ".join(clauses) if clauses else "true"

    score_expr = "pdb.score(w.doc_id)" if f.title_match else "NULL::real"
    order = (
        "pdb.score(w.doc_id) DESC, w.title"
        if f.title_match
        else "w.collection, w.title, w.doc_id"
    )
    rows_sql = f"""
        SELECT w.doc_id, w.title, w.author_speaker, w.publisher, w.collection,
               w.language, w.source_type, w.passage_count, w.char_count,
               w.ordering_confident, w.canonical, {score_expr} AS title_score
        FROM works w
        WHERE {where}
        ORDER BY {order}
        LIMIT %s OFFSET %s
    """
    count_sql = f"SELECT count(*) AS n FROM works w WHERE {where}"

    rows = fetch_all(rows_sql, (*params, body.limit, body.offset))
    total = fetch_all(count_sql, tuple(params))[0]["n"]

    elapsed_ms = (time.perf_counter() - t0) * 1000
    _capture(request, "list_works", elapsed_ms, result_count=len(rows), total=total)
    return ListWorksResponse(
        works=[WorkSummary(**r) for r in rows],
        total=total,
        limit=body.limit,
        offset=body.offset,
        elapsed_ms=round(elapsed_ms, 2),
    )


# ── get_work_outline ─────────────────────────────────────────────────────


class WorkOutlineRequest(BaseModel):
    doc_id: str
    max_entries: int = Field(default=200, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class SectionEntry(BaseModel):
    ordering: int
    chapter_section: str


class OutlineEntry(BaseModel):
    ordering: int
    page_number: Optional[int] = None
    chars: int
    preview: str


class WorkOutlineResponse(BaseModel):
    doc_id: str
    title: str
    author_speaker: str
    publisher: str
    collection: str
    language: str
    source_type: str
    passage_count: int
    char_count: int
    # When false, passage order is stable but arbitrary (the source had no
    # recoverable page numbers/timestamps) — don't present it as book order.
    ordering_confident: bool
    canonical: bool
    duplicate_of: Optional[str] = None
    sections: list[SectionEntry]
    passage_map: list[OutlineEntry]
    passage_map_offset: int
    passage_map_truncated: bool


@router.post("/get_work_outline", response_model=WorkOutlineResponse)
def get_work_outline(request: Request, body: WorkOutlineRequest) -> WorkOutlineResponse:
    t0 = time.perf_counter()
    works = fetch_all(
        """
        SELECT doc_id, title, author_speaker, publisher, collection, language,
               source_type, passage_count, char_count, ordering_confident,
               canonical, duplicate_of
        FROM works WHERE doc_id = %s
        """,
        (body.doc_id,),
    )
    if not works:
        raise HTTPException(status_code=404, detail=f"Unknown doc_id: {body.doc_id}")
    work = works[0]

    sections = fetch_all(
        "SELECT ordering, chapter_section FROM sections WHERE work_id = %s ORDER BY ordering",
        (body.doc_id,),
    )
    # `sections` was never populated at ingest for almost all works (79 rows
    # corpus-wide), so the passage map below is the real outline surface.
    passage_map = fetch_all(
        """
        SELECT ordering, page_number, length(text) AS chars,
               left(regexp_replace(text, '\\s+', ' ', 'g'), 80) AS preview
        FROM passages
        WHERE work_id = %s
        ORDER BY ordering
        LIMIT %s OFFSET %s
        """,
        (body.doc_id, body.max_entries, body.offset),
    )
    truncated = body.offset + len(passage_map) < work["passage_count"]

    elapsed_ms = (time.perf_counter() - t0) * 1000
    _capture(request, "get_work_outline", elapsed_ms, entries=len(passage_map))
    return WorkOutlineResponse(
        **work,
        sections=[SectionEntry(**s) for s in sections],
        passage_map=[OutlineEntry(**p) for p in passage_map],
        passage_map_offset=body.offset,
        passage_map_truncated=truncated,
    )


# ── read_document ────────────────────────────────────────────────────────


class ReadDocumentRequest(BaseModel):
    doc_id: str
    # Passage range by `ordering` (inclusive). Defaults to the whole work.
    start_passage: Optional[int] = Field(default=None, ge=0)
    end_passage: Optional[int] = Field(default=None, ge=0)
    # OR a printed-page range (inclusive; only meaningful for works whose
    # passages carry page_number). Takes precedence over passage bounds.
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    # Char-window pagination inside the resolved range.
    char_offset: int = Field(default=0, ge=0)
    char_limit: int = Field(default=MAX_READ_CHARS, ge=200, le=MAX_READ_CHARS)


class PassagePosition(BaseModel):
    ordering: int
    page_number: Optional[int] = None
    # Offset of this passage's slice within the returned `text`.
    char_start: int


class ReadDocumentResponse(BaseModel):
    doc_id: str
    title: str
    author_speaker: str
    source_type: str
    ordering_confident: bool
    range_start_passage: int
    range_end_passage: int
    char_offset: int
    chars_returned: int
    total_chars_in_range: int
    # Continue reading from here (pass back as char_offset); null = done.
    next_char_offset: Optional[int] = None
    text: str
    passages: list[PassagePosition]


@router.post("/read_document", response_model=ReadDocumentResponse)
def read_document(request: Request, body: ReadDocumentRequest) -> ReadDocumentResponse:
    t0 = time.perf_counter()
    works = fetch_all(
        """
        SELECT doc_id, title, author_speaker, source_type, ordering_confident
        FROM works WHERE doc_id = %s
        """,
        (body.doc_id,),
    )
    if not works:
        raise HTTPException(status_code=404, detail=f"Unknown doc_id: {body.doc_id}")
    work = works[0]

    # Resolve the passage range.
    start, end = body.start_passage, body.end_passage
    if body.page_start is not None or body.page_end is not None:
        page_start = body.page_start if body.page_start is not None else body.page_end
        page_end = body.page_end if body.page_end is not None else body.page_start
        bounds = fetch_all(
            """
            SELECT min(ordering) AS a, max(ordering) AS b
            FROM passages
            WHERE work_id = %s AND page_number BETWEEN %s AND %s
            """,
            (body.doc_id, page_start, page_end),
        )[0]
        if bounds["a"] is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No passages with page_number in [{page_start}, {page_end}] "
                    f"for doc_id {body.doc_id}"
                    + ("" if work["ordering_confident"] else
                       " (this work has no recovered page numbers)")
                ),
            )
        start, end = bounds["a"], bounds["b"]

    range_clauses = ["work_id = %s"]
    range_params: list = [body.doc_id]
    if start is not None:
        range_clauses.append("ordering >= %s")
        range_params.append(start)
    if end is not None:
        range_clauses.append("ordering <= %s")
        range_params.append(end)
    range_where = " AND ".join(range_clauses)

    # Pass 1: lengths only — never pull 200KB blobs we won't return.
    meta = fetch_all(
        f"""
        SELECT ordering, page_number, length(text) AS chars
        FROM passages WHERE {range_where} ORDER BY ordering
        """,
        tuple(range_params),
    )
    if not meta:
        raise HTTPException(
            status_code=404,
            detail=f"No passages in the requested range for doc_id {body.doc_id}",
        )

    lengths = [m["chars"] for m in meta]
    slices, total_chars, next_offset = compute_read_window(
        lengths, body.char_offset, body.char_limit
    )

    # Pass 2: fetch only the passages the window intersects, pre-sliced
    # in SQL so a 200KB transcript passage costs only its visible part.
    text_by_ordering: dict[int, str] = {}
    if slices:
        cases = []
        fetch_params: list = []
        orderings = []
        for idx, s, e in slices:
            ordering = meta[idx]["ordering"]
            orderings.append(ordering)
            cases.append("WHEN ordering = %s THEN substring(text FROM %s FOR %s)")
            fetch_params.extend([ordering, s + 1, e - s])
        sliced_sql = f"""
            SELECT ordering, CASE {' '.join(cases)} END AS part
            FROM passages
            WHERE work_id = %s AND ordering = ANY(%s)
        """
        fetch_params.extend([body.doc_id, orderings])
        for row in fetch_all(sliced_sql, tuple(fetch_params)):
            text_by_ordering[row["ordering"]] = row["part"] or ""

    parts: list[str] = []
    positions: list[PassagePosition] = []
    cursor = 0
    prev_idx: Optional[int] = None
    for idx, s, e in slices:
        if prev_idx is not None:
            parts.append(SEPARATOR)
            cursor += len(SEPARATOR)
        part = text_by_ordering.get(meta[idx]["ordering"], "")
        positions.append(
            PassagePosition(
                ordering=meta[idx]["ordering"],
                page_number=meta[idx]["page_number"],
                char_start=cursor,
            )
        )
        parts.append(part)
        cursor += len(part)
        prev_idx = idx
    text = "".join(parts)

    elapsed_ms = (time.perf_counter() - t0) * 1000
    _capture(
        request, "read_document", elapsed_ms,
        chars_returned=len(text), passages=len(positions),
    )
    return ReadDocumentResponse(
        doc_id=work["doc_id"],
        title=work["title"],
        author_speaker=work["author_speaker"],
        source_type=work["source_type"],
        ordering_confident=work["ordering_confident"],
        range_start_passage=meta[0]["ordering"],
        range_end_passage=meta[-1]["ordering"],
        char_offset=body.char_offset,
        chars_returned=len(text),
        total_chars_in_range=total_chars,
        next_char_offset=next_offset,
        text=text,
        passages=positions,
    )


# ── search_corpus ────────────────────────────────────────────────────────


class SearchCorpusFilters(BaseModel):
    language: Optional[str] = Field(default=None, pattern=r"^(tr|ar|en|tr\+ar|ota)$")
    collection: Optional[str] = None
    category: Optional[str] = Field(
        default=None, pattern=r"^(risale|risale_dersleri|pirlanta|hizmet)$"
    )
    author_prefix: Optional[str] = None


class SearchCorpusRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=8, ge=1, le=20)
    filters: Optional[SearchCorpusFilters] = None
    # Default OFF for the agent loop: the CPU cross-encoder adds ~2s per
    # call and the loop makes many calls; opt in for final-answer passes.
    use_reranker: bool = False


@router.post("/search_corpus", response_model=SearchResponse)
def search_corpus(
    request: Request,
    body: SearchCorpusRequest,
    pipeline=Depends(get_retrieval_pipeline),
) -> SearchResponse:
    t0 = time.perf_counter()
    f = body.filters or SearchCorpusFilters()

    cat_kwargs: dict = {}
    if f.category and f.category in CATEGORY_SPECS:
        cat_kwargs = dict(CATEGORY_SPECS[f.category])
    if f.author_prefix:
        prefixes = list(cat_kwargs.get("author_prefixes") or [])
        if f.author_prefix not in prefixes:
            prefixes.append(f.author_prefix)
        cat_kwargs["author_prefixes"] = prefixes

    results = pipeline.retrieve(
        query=body.query,
        top_k=body.top_k,
        language=f.language,
        collection=f.collection if not cat_kwargs.get("collections") else None,
        use_reranker=body.use_reranker,
        **cat_kwargs,
    )

    elapsed_ms = (time.perf_counter() - t0) * 1000
    items = [
        SearchResultItem(
            chunk=_chunk_to_response(r.chunk),
            score=r.score,
            rerank_score=r.rerank_score,
        )
        for r in results
    ]
    _capture(
        request, "search_corpus", elapsed_ms,
        result_count=len(items), use_reranker=body.use_reranker,
        category=f.category,
    )
    return SearchResponse(
        results=items,
        query=body.query,
        result_count=len(items),
        retrieval_time_ms=round(elapsed_ms, 2),
    )
