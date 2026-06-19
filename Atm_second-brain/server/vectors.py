"""Persisted embedding index — vector candidate generation. Standard library only.

The hybrid retriever (rank/recall) can RERANK a lexical candidate pool with an
optional embedder, but a paraphrase that shares no term with the query never enters
that pool. This module closes that gap: it embeds notes ONCE (cached in the SQLite
index, keyed by content hash + model id) so recall can do real vector search —
finding semantically-near notes with zero lexical overlap — without re-embedding
the corpus on every query.

It stays zero-dependency and opt-in:
  - ships no model (the embedder is the user's `ATM_EMBED_CMD`),
  - cosine is brute-force pure Python over the cache (fine for opt-in vaults; a
    native vector index can be swapped in later without changing this contract),
  - if no provider is configured the cache is simply never built and recall runs
    lexical, exactly as before.

Vectors are stored as packed float32 (`array`), compact and stdlib.
"""
from __future__ import annotations

import array
import json
from typing import Optional

import embeddings
import index


def _pack(vec: list[float]) -> bytes:
    return array.array("f", vec).tobytes()


def _unpack(blob: bytes) -> list[float]:
    a = array.array("f")
    a.frombytes(blob)
    return list(a)


def embed_index(db_path: Optional[str] = None, provider=None, rebuild: bool = False,
                batch: int = 64) -> dict:
    """Build/refresh the embedding cache for the current model. Incremental: only
    notes whose body_hash changed (or that were embedded under a different model)
    are re-embedded. Prunes vectors for deleted notes."""
    provider = provider or embeddings.get_provider()
    if not provider.available():
        return {"ok": False, "reason": "no embedding provider configured (set ATM_EMBED_CMD)"}
    model = provider.model_id()

    index.reindex(full=False, db_path=db_path)  # keep the note table fresh first
    con = index.connect(db_path)
    try:
        cached = {r["id"]: (r["body_hash"], r["model"])
                  for r in con.execute("SELECT id, body_hash, model FROM embeddings")}
        rows = con.execute(
            "SELECT id, title, body, body_hash FROM notes WHERE parse_error IS NULL"
        ).fetchall()

        todo = []
        for r in rows:
            c = cached.get(r["id"])
            if rebuild or c is None or c[0] != r["body_hash"] or c[1] != model:
                todo.append(r)

        embedded = 0
        dim = None
        for i in range(0, len(todo), batch):
            chunk = todo[i:i + batch]
            texts = [((r["title"] or "") + "\n" + (r["body"] or "")) for r in chunk]
            vecs = provider.embed(texts)
            if not vecs or len(vecs) != len(chunk):
                con.rollback()
                return {"ok": False, "reason": "embedder failed or returned wrong shape",
                        "embedded": embedded}
            dim = len(vecs[0])
            for r, v in zip(chunk, vecs):
                con.execute(
                    "INSERT OR REPLACE INTO embeddings (id, model, dim, body_hash, vec) "
                    "VALUES (?,?,?,?,?)",
                    (r["id"], model, dim, r["body_hash"], _pack([float(x) for x in v])),
                )
            embedded += len(chunk)

        # prune vectors whose notes are gone
        con.execute("DELETE FROM embeddings WHERE id NOT IN (SELECT id FROM notes)")
        con.commit()
        total = con.execute(
            "SELECT COUNT(*) c FROM embeddings WHERE model=?", (model,)
        ).fetchone()["c"]
        return {
            "ok": True, "model": model, "dim": dim,
            "embedded": embedded, "skipped": len(rows) - len(todo),
            "total": total, "notes": len(rows),
        }
    finally:
        con.close()


def cache_status(con, model: Optional[str]) -> dict:
    if not model:
        return {"populated": False, "count": 0}
    row = con.execute("SELECT COUNT(*) c FROM embeddings WHERE model=?", (model,)).fetchone()
    return {"populated": row["c"] > 0, "count": row["c"], "model": model}


def query_similarities(con, provider, query: str, model: Optional[str] = None):
    """Return (sims dict id->cosine over the WHOLE cache for this model, query_vec).
    Empty dict if the cache isn't populated for this model or the embedder fails."""
    model = model or provider.model_id()
    if not model:
        return {}, None
    rows = con.execute("SELECT id, vec FROM embeddings WHERE model=?", (model,)).fetchall()
    if not rows:
        return {}, None
    qv = provider.embed([query])
    if not qv or len(qv) != 1:
        return {}, None
    qvec = [float(x) for x in qv[0]]
    sims = {r["id"]: embeddings.cosine(qvec, _unpack(r["vec"])) for r in rows}
    return sims, qvec


def embed_index_cli(argv: list[str]) -> int:
    rebuild = "--rebuild" in argv
    res = embed_index(rebuild=rebuild)
    print(json.dumps(res, indent=2))
    return 0 if res.get("ok") else 1
