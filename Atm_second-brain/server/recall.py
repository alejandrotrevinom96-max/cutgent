"""recall: hybrid ranked retrieval + the anti-autophagy human-information floor.
Standard library only.

Ranking fuses several weak signals via Reciprocal Rank Fusion (see `rank`):
  1. lexical bm25 (FTS5) or a LIKE-fallback term score,
  2. a TF-IDF cosine ranker over the candidate pool,
  3. (optional) an embedding reranker, only if a provider is configured,
then adds a small graph-adjacency boost for notes linked to the top hits.
Pseudo-relevance feedback widens the candidate pool with co-occurring terms so
related notes that don't repeat the query verbatim can still surface.

Before returning, recall enforces the human-information floor: a minimum fraction
of the grounding set must be human-authored or human-confirmed. If the top-k falls
short, recall backfills with the best-matching human notes and reports whether the
floor was met. None of the ranking changes can weaken that floor.
"""
from __future__ import annotations

import json
import re
from typing import Optional

import config
import embeddings
import graph
import index
import rank
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


def _build_trace(con, top, text_hits: set) -> dict:
    """Reconstruct the honest seed->1-hop traversal that produced `top`.

    seeds   = result notes that matched the query text (FTS/LIKE hits)
    expanded= result notes pulled in purely by 1-hop graph adjacency
    edges   = the resolved links connecting them (with type)
    steps   = ordered walk (seeds first, then expansions) for animation
    The app derives layout/clustering/timing; the brain emits only what it knows.
    """
    top_ids = [r["id"] for r in top]
    seed_ids = [i for i in top_ids if i in text_hits]
    expanded_ids = [i for i in top_ids if i not in text_hits]
    seed_set = set(seed_ids)

    edges: list[dict] = []
    edge_index: dict[tuple, int] = {}

    def add_edge(src, dst, etype) -> int:
        key = (src, dst)
        if key in edge_index:
            return edge_index[key]
        idx = len(edges)
        edges.append({"src": src, "dst": dst, "type": etype or "wikilink"})
        edge_index[key] = idx
        return idx

    steps: list[dict] = [{"kind": "seed", "node": i} for i in seed_ids]

    # seed<->seed links (richer static graph, no step — they're all seeds already)
    for s in seed_ids:
        for r in con.execute(
            "SELECT dst_id, link_type FROM links WHERE src_id=? AND dst_id IS NOT NULL", (s,)
        ):
            if r["dst_id"] in seed_set and r["dst_id"] != s:
                add_edge(s, r["dst_id"], r["link_type"])

    # each expanded node: find the edge to a seed (backlink first, then outlink)
    for nid in expanded_ids:
        edge_idx = None
        for r in con.execute(
            "SELECT src_id, link_type FROM links WHERE dst_id=? AND src_id IS NOT NULL", (nid,)
        ):
            if r["src_id"] in seed_set:
                edge_idx = add_edge(r["src_id"], nid, r["link_type"])
                break
        if edge_idx is None:
            for r in con.execute(
                "SELECT dst_id, link_type FROM links WHERE src_id=? AND dst_id IS NOT NULL", (nid,)
            ):
                if r["dst_id"] in seed_set:
                    edge_idx = add_edge(nid, r["dst_id"], r["link_type"])
                    break
        steps.append({"kind": "expand", "edge": edge_idx, "node": nid})

    return {
        "schema": "recall.trace/1",
        "tier": None,
        "seeds": seed_ids,
        "expanded": expanded_ids,
        "edges": edges,
        "steps": steps,
        "answer_sources": top_ids[:3],
    }


def recall(query: str, k: int = 12, type_filter: Optional[str] = None,
           domain: Optional[str] = None, with_trace: bool = False,
           db_path: Optional[str] = None) -> dict:
    terms = _terms(query)
    if not terms:
        empty = {"results": [], "human_fraction": 0.0, "floor": HUMAN_FLOOR,
                 "floor_met": True, "mode": "empty-query", "query": query}
        if with_trace:
            empty["trace"] = {"schema": "recall.trace/1", "tier": None, "seeds": [],
                              "expanded": [], "edges": [], "steps": [], "answer_sources": []}
            empty["rev"] = config.current_rev()
        return empty

    # Keep the index honest with disk before answering.
    index.reindex(full=False, db_path=db_path)
    con = index.connect(db_path)
    try:
        mode = "fts5" if has_fts5() else "like"
        lexical = _fts_candidates if has_fts5() else _like_candidates
        pool = lexical(con, terms, max(k * 4, 40))
        # Query-text matches form the precision spine and the trace seeds.
        text_hits = set(pool)

        def _body(nid: str) -> str:
            row = con.execute("SELECT title, body FROM notes WHERE id=?", (nid,)).fetchone()
            if not row:
                return ""
            return (row["title"] or "") + "\n" + (row["body"] or "")

        docs = {nid: _body(nid) for nid in pool}

        # --- signal 1: lexical (bm25 / LIKE) rank list ---
        lex_list = sorted(pool, key=lambda i: pool[i]["score"], reverse=True)
        # --- signal 2: TF-IDF cosine over the pool, scored against the original query ---
        tfidf = rank.tfidf_scores(terms, docs)
        tfidf_list = sorted(tfidf, key=lambda i: tfidf[i], reverse=True)

        # --- optional embeddings over the candidate pool ---
        provider = embeddings.get_provider()
        sims: dict[str, float] = {}
        embed_used = False
        if provider.available() and pool:
            ids = list(pool)
            vecs = provider.embed([query] + [docs[i] for i in ids])
            if vecs and len(vecs) == len(ids) + 1:
                qv = vecs[0]
                sims = {ids[j]: embeddings.cosine(qv, vecs[j + 1]) for j in range(len(ids))}
                embed_used = True

        # --- graph adjacency neighbors of the strongest lexical hits ---
        graph_neighbors = graph.expand(con, lex_list[:k])
        for nid in graph_neighbors:
            docs.setdefault(nid, _body(nid))

        if embed_used:
            # Retrieve-then-rerank: a configured semantic model ORDERS the pool, with
            # lexical as a stable tiebreak and graph a small bonus. (Pool generation
            # is still lexical+PRF+graph, so a zero-overlap paraphrase must first enter
            # the pool; a persisted vector index for pure semantic candidate generation
            # is the documented next ceiling step — see docs/BENCHMARKS.md.)
            maxlex = max((pool[i]["score"] for i in pool), default=1.0) or 1.0
            fused = {nid: sims.get(nid, 0.0) + 0.05 * (pool[nid]["score"] / maxlex) for nid in pool}
            for nid in graph_neighbors:
                fused[nid] = fused.get(nid, 0.0) + 0.03
        else:
            # Zero-dependency hybrid: fuse lexical + TF-IDF + graph via RRF. Graph is
            # kept modest so it enriches without overriding the lexical/semantic spine.
            rank_lists = [lex_list, tfidf_list]
            weights = [1.0, 0.8]
            graph_list = sorted(graph_neighbors, key=lambda i: graph_neighbors[i])
            if graph_list:
                rank_lists.append(graph_list)
                weights.append(0.5)
            fused = rank.rrf_fuse(rank_lists, weights=weights)
            for nid in pool:
                fused.setdefault(nid, 0.0)

        # --- recall tail: pseudo-relevance feedback. Mine co-occurring terms from
        # the strongest hits, re-query, and admit genuinely-related notes (positive
        # TF-IDF to the ORIGINAL query) strictly BELOW the precision spine, so recall
        # rises without ever displacing a true match or weakening the human floor. ---
        expanded_terms = rank.expand_query(terms, docs, lex_list[: max(3, k // 2)])
        if expanded_terms:
            widened = lexical(con, terms + expanded_terms, max(k * 4, 40))
            new_ids = [nid for nid in widened if nid not in fused]
            prf_docs = {nid: _body(nid) for nid in new_ids}
            prf_rel = rank.tfidf_scores(terms, {**docs, **prf_docs})
            for nid in new_ids:
                rel = prf_rel.get(nid, 0.0)
                if rel <= 0:
                    continue  # must actually relate to the original query, not just expansion
                fused[nid] = -1.0 + rel  # negative => always ranked under the spine
                text_hits.add(nid)
                docs[nid] = prf_docs[nid]

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
                "domain": row["domain"], "score": round(fused[nid], 6),
                "snippet": _make_snippet(docs.get(nid, ""), terms), "human": _is_human(row),
            }

        ranked = sorted(
            (h for nid in fused if (h := hydrate(nid)) is not None),
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

        signals = ["lexical", "tfidf"] + (["embeddings"] if embed_used else [])
        result = {
            "results": top,
            "human_fraction": round(frac, 3),
            "floor": HUMAN_FLOOR,
            "floor_met": floor_met,
            "mode": mode,
            "query": query,
            "retrieval": {
                "fusion": "rrf",
                "signals": signals,
                "expanded_query": expanded_terms,
                "embeddings": embed_used,
            },
            "provenance": (
                f"recall/{mode}+rrf({'+'.join(signals)}); "
                f"human_fraction={round(frac,3)}; floor_met={floor_met}"
            ),
        }
        if with_trace:
            result["trace"] = _build_trace(con, top, text_hits)
            result["rev"] = config.current_rev()
        return result
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
        with_trace=bool(args.get("with_trace", False)),
    )
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
