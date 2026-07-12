"""Postgres (docstore) connection pool.

The docstore (works / sections / passages + ParadeDB BM25 indexes) is a
read-only dependency of the /tools/* endpoints. psycopg is imported
lazily so the FastAPI app (and its CI test suite) can run without the
docstore stack installed — only the first /tools call needs it.
"""

from __future__ import annotations

import os
from functools import lru_cache


@lru_cache(maxsize=1)
def get_pg_pool():
    """Singleton psycopg connection pool for the docstore."""
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool

    dsn = os.environ.get("PG_DSN", "")
    if not dsn:
        raise RuntimeError(
            "PG_DSN is not set — the /tools/* endpoints need the docstore DSN"
        )
    return ConnectionPool(
        dsn,
        min_size=1,
        max_size=4,
        open=True,
        name="docstore",
        kwargs={
            "autocommit": True,
            "row_factory": dict_row,
            # Keep runaway queries from piling up. (NB: not
            # default_transaction_read_only — pg_search's pdb.alias()
            # queries write to internal state and fail read-only.)
            "options": "-c statement_timeout=15000",
        },
    )


def fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    """Run one query on a pooled connection, return rows as dicts."""
    pool = get_pg_pool()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
