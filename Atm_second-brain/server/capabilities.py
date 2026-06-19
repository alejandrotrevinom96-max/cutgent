"""Runtime capability probes — decide cheapest-correct operating mode.

Standard library only. Right now we probe SQLite FTS5 availability; the result
drives whether the index uses FTS5 or a LIKE fallback (wired in P2). Keeping the
probe here means every entry point sees the same answer.
"""
from __future__ import annotations

import sqlite3
from functools import lru_cache


@lru_cache(maxsize=1)
def has_fts5() -> bool:
    """True if this Python's bundled SQLite was built with the FTS5 extension."""
    con = sqlite3.connect(":memory:")
    try:
        con.execute("CREATE VIRTUAL TABLE _probe USING fts5(x)")
        con.execute("DROP TABLE _probe")
        return True
    except sqlite3.OperationalError:
        return False
    finally:
        con.close()


@lru_cache(maxsize=1)
def sqlite_features() -> dict:
    """Snapshot of relevant SQLite features for diagnostics / degraded routing."""
    con = sqlite3.connect(":memory:")
    try:
        (ver,) = con.execute("select sqlite_version()").fetchone()
    finally:
        con.close()
    return {
        "sqlite_version": ver,
        "fts5": has_fts5(),
        # json1 has been compiled-in by default since SQLite 3.38; we rely on it.
        "json1": True,
    }
