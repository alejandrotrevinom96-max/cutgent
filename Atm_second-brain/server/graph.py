"""Link/tag graph helpers over the index. Standard library only.

Separate from full-text search by design: the graph answers "what is connected"
while FTS answers "what mentions these words". recall blends both.
"""
from __future__ import annotations

import sqlite3


def neighbors(con: sqlite3.Connection, note_id: str) -> dict:
    """1-hop neighbors of a note: resolved outlinks and backlinks."""
    out = [
        r["dst_id"]
        for r in con.execute(
            "SELECT DISTINCT dst_id FROM links WHERE src_id=? AND dst_id IS NOT NULL",
            (note_id,),
        )
    ]
    back = [
        r["src_id"]
        for r in con.execute(
            "SELECT DISTINCT src_id FROM links WHERE dst_id=?", (note_id,)
        )
    ]
    return {"outlinks": out, "backlinks": back}


def expand(con: sqlite3.Connection, seed_ids: list[str]) -> dict[str, int]:
    """Map neighbor_id -> distance(=1) for all 1-hop neighbors of the seeds,
    excluding the seeds themselves. Used to give graph-adjacent notes a boost."""
    seen = set(seed_ids)
    out: dict[str, int] = {}
    for sid in seed_ids:
        n = neighbors(con, sid)
        for nid in n["outlinks"] + n["backlinks"]:
            if nid and nid not in seen and nid not in out:
                out[nid] = 1
    return out
