"""recall: ranked retrieval blending full-text, graph adjacency, and the
anti-autophagy human-information floor. Standard library only.

Ranking = FTS5 bm25 (or a LIKE-fallback term score) + a small graph-adjacency
boost for notes linked to top hits. Before returning, recall enforces the
human-information floor: a minimum fraction of the grounding set must be
human-authored or human-confirmed. If the top-k falls short, recall backfills
with the best-matching human notes and reports whether the floor was met.
"""
from __future__ import annotations

import json
import re
from typing import Optional

import config
import graph
import index
from capabilities import has_fts5

# At least this fraction of the returned grounding set must be human-grounded,
# so the brain can't synthesize primarily from its own prior output.
HUMAN_FLOOR = 0.34
GRAPH_BOOST = 0.5

_TERM = re.compile(r"[a-z0-9]+")
_STOP = {"the", "a", "an", "of", "to", "and", "or", "is", "in", "on", "for", "it"}


def _terms(query: str) -> list[str]:
    return [t for t in _TERM.findall(query.lower()) if t not in _STOP and len(t) > 1]


def _is_human(row) -> bool:
    return (row["author"] in ("human", "mixed")) or (row["trust_tier"] == "human-confirmed")


def _fts_candidates(con, terms: list[str], limit: int) -> dict[str, dict]:
    match = " OR ".join(f'"{t}"' for t in terms)
    rows = con.execute(
        """SELECT f.id AS id, bm25(notes_fts) AS rank,
                  snippet(notes_fts, 2, '[', ']', ' … ', 12) AS snip
           FROM notes_fts f
           WHERE notes_fts MATCH ?
           ORDER BY rank
           LIMIT ?""",
        (match, limit),
    ).fetchall()
    out: dict[str, dict] = {}
    for r in rows:
        out[r["id"]] = {"score": -float(r["rank"]), "snippet": r["snip"]}
    return out


def _like_candidates(con, terms: list[str], limit: int) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in con.execute("SELECT id, title, body FROM notes"):
        title = (r["title"] or "").lower()
        body = (r["body"] or "").lower()
        score = 0.0
        for t in terms:
            score += 3.0 * title.count(t) + body.count(t)
        if score > 0:
            snip = _make_snippet(r["body"] or "", terms)
            out[r["id"]] = {"score": score, "snippet": snip}
    # keep top `limit`
    top = dict(sorted(out.items(), key=lambda kv: kv[1]["score"], reverse=True)[:limit])
    return top


def _make_snippet(body: str, terms: list[str], width: int = 120) -> str:
    low = body.lower()
    for t in terms:
        i = low.find(t)
        if i >= 0:
            start = max(0, i - width // 2)
            return ("… " if start > 0 else "") + body[start:start + width].replace("\n", " ").strip() + " …"
    return body[:width].replace("\n", " ").strip()


def recall(query: str, k: int = 12, type_filter: Optional[str] = None,
           domain: Optional[str] = None, db_path: Optional[str] = None) -> dict:
    terms = _terms(query)
    if not terms:
        return {"results": [], "human_fraction": 0.0, "floor": HUMAN_FLOOR,
                "floor_met": True, "mode": "empty-query", "query": query}

    # Keep the index honest with disk before answering.
    index.reindex(full=False, db_path=db_path)
    con = index.connect(db_path)
    try:
        mode = "fts5" if has_fts5() else "like"
        pool = (_fts_candidates if has_fts5() else _like_candidates)(con, terms, max(k * 4, 40))

        # Graph adjacency boost from the strongest seeds.
        seeds = sorted(pool, key=lambda i: pool[i]["score"], reverse=True)[:k]
        for nid, _dist in graph.expand(con, seeds).items():
            if nid in pool:
                pool[nid]["score"] += GRAPH_BOOST
            else:
                row = con.execute("SELECT body FROM notes WHERE id=?", (nid,)).fetchone()
                if row:
                    pool[nid] = {"score": GRAPH_BOOST, "snippet": _make_snippet(row["body"] or "", terms)}

        # Hydrate metadata + apply filters.
        def hydrate(nid: str) -> Optional[dict]:
            row = con.execute(
                "SELECT id, path, title, type, trust_tier, author, domain FROM notes WHERE id=?",
                (nid,),
            ).fetchone()
            if not row:
                return None
            if type_filter and row["type"] != type_filter:
                return None
            if domain and row["domain"] != domain:
                return None
            return {
                "id": row["id"], "path": row["path"], "title": row["title"],
                "type": row["type"], "trust_tier": row["trust_tier"], "author": row["author"],
                "domain": row["domain"], "score": round(pool[nid]["score"], 4),
                "snippet": pool[nid]["snippet"], "human": _is_human(row),
            }

        ranked = sorted(
            (h for nid in pool if (h := hydrate(nid)) is not None),
            key=lambda d: d["score"], reverse=True,
        )
        top = ranked[:k]

        # Human-information floor enforcement.
        human_n = sum(1 for r in top if r["human"])
        frac = human_n / len(top) if top else 0.0
        floor_met = frac >= HUMAN_FLOOR or not top
        if not floor_met:
            need = -(-int(HUMAN_FLOOR * len(top)) // 1)  # ceil
            extra_humans = [r for r in ranked[k:] if r["human"]]
            for r in extra_humans:
                if human_n >= need:
                    break
                top.append(r)
                human_n += 1
            human_n = sum(1 for r in top if r["human"])
            frac = human_n / len(top) if top else 0.0
            floor_met = frac >= HUMAN_FLOOR

        return {
            "results": top,
            "human_fraction": round(frac, 3),
            "floor": HUMAN_FLOOR,
            "floor_met": floor_met,
            "mode": mode,
            "query": query,
            "provenance": f"recall/{mode}; human_fraction={round(frac,3)}; floor_met={floor_met}",
        }
    finally:
        con.close()


def recall_tool(args: dict) -> dict:
    query = args.get("query")
    if not query:
        raise ValueError("recall requires 'query'")
    result = recall(
        query=str(query),
        k=int(args.get("k", 12)),
        type_filter=args.get("type"),
        domain=args.get("domain"),
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
