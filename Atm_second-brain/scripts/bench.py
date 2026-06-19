#!/usr/bin/env python3
"""Scale benchmark — measure index + retrieval behaviour as the vault grows.

Generates a synthetic vault of N notes (deterministic, seeded), then times:
  - full reindex,
  - incremental reindex with no changes (should be ~no work),
  - recall latency over a fixed query set (p50 / p95),
  - graph_export.

Standard library only; builds in a temp dir and never touches the real vault.

    python3 scripts/bench.py                # default sizes: 1000 5000
    python3 scripts/bench.py 1000 10000 50000
"""
from __future__ import annotations

import os
import random
import shutil
import statistics
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))

VOCAB = (
    "negotiation anchor batna leverage concession interest position margin runway "
    "cashflow recall provenance trust tier guardrail invariant migration schema "
    "lighting composition lens aperture exposure color grade narrative hook retention "
    "habit motivation cognition bias evidence rubric exemplar pipeline rendering rig "
    "budget forecast revenue profit equity audience funnel channel cohort retention "
    "contract license copyright release jurisdiction attorney boundary disclosure "
    "listening validation boundary repair attachment empathy positioning resume "
    "leverage strategy positioning differentiation segment metric experiment latency"
).split()

QUERIES = [
    "negotiation anchor batna leverage",
    "trust tier provenance guardrail",
    "lighting composition lens exposure",
    "revenue profit margin runway",
    "habit motivation cognition bias",
    "contract license copyright jurisdiction",
    "recall ranking retrieval latency",
    "audience funnel channel retention",
]

AUTHORS = ["human", "human", "agent", "mixed"]          # ~50% human-grounded
TIERS = ["human-confirmed", "self-authored", "externally-ingested"]
DOMAINS = ["negotiation", "business-finance", "cinematography", "psychology", "legal-literacy"]


def _build_vault(root: str, n: int, seed: int = 1234) -> None:
    rng = random.Random(seed)
    os.makedirs(os.path.join(root, "_schema"), exist_ok=True)
    for f in ("schema.v1.json", "CURRENT"):
        shutil.copy(os.path.join(ROOT, "_schema", f), os.path.join(root, "_schema", f))
    notes_dir = os.path.join(root, "vault", "concepts")
    os.makedirs(notes_dir, exist_ok=True)

    ids = [f"{20260619000000 + i:014d}-note-{i}" for i in range(n)]
    for i in range(n):
        nid = ids[i]
        author = rng.choice(AUTHORS)
        tier = "human-confirmed" if author in ("human", "mixed") else rng.choice(TIERS)
        domain = rng.choice(DOMAINS)
        body_words = rng.choices(VOCAB, k=60)
        # a few wikilinks to other notes, to exercise the graph
        links = "".join(f" [[{ids[rng.randrange(n)]}]]" for _ in range(rng.randint(0, 4)))
        body = " ".join(body_words) + links
        fm = (
            f'---\nschema_version: 1\nid: "{nid}"\ntitle: "Note {i} {body_words[0]} {body_words[1]}"\n'
            f"type: note\ncreated: 2026-06-19\nupdated: 2026-06-19\n"
            f"trust_tier: {tier}\nauthor: {author}\ndomain: {domain}\n"
            f"tags: [bench, domain/{domain}]\n---\n\n# Note {i}\n\n{body}\n"
        )
        with open(os.path.join(notes_dir, f"n{i}.md"), "w", encoding="utf-8") as fh:
            fh.write(fm)


def run_bench(n: int, root: str | None = None) -> dict:
    """Build N notes and measure index + recall. Returns a metrics dict."""
    import config
    tmp = root or tempfile.mkdtemp(prefix=f"atmbench{n}-")
    created = root is None
    db = os.path.join(tmp, ".atm", "index.db")
    try:
        _build_vault(tmp, n)
        config.VAULT_ROOT = tmp
        config.VAULT_DIR = os.path.join(tmp, "vault")
        config.SCHEMA_DIR = os.path.join(tmp, "_schema")
        config.DB_PATH = db
        import importlib
        import index as index_mod
        import recall as recall_mod
        importlib.reload(index_mod)
        importlib.reload(recall_mod)

        t0 = time.perf_counter()
        summ = index_mod.reindex(full=True, db_path=db)
        t_full = time.perf_counter() - t0

        t0 = time.perf_counter()
        summ2 = index_mod.reindex(full=False, db_path=db)
        t_incr = time.perf_counter() - t0

        lats = []
        floor_ok = True
        for q in QUERIES:
            t0 = time.perf_counter()
            r = recall_mod.recall(q, k=12, db_path=db)
            lats.append((time.perf_counter() - t0) * 1000.0)
            floor_ok = floor_ok and r.get("floor_met", False)

        t0 = time.perf_counter()
        g = index_mod.graph_export(db_path=db)
        t_graph = time.perf_counter() - t0

        lats.sort()
        return {
            "n": n,
            "indexed": summ["notes"],
            "links": summ["links"],
            "fts5": summ["fts5"],
            "reindex_full_s": round(t_full, 3),
            "reindex_incremental_s": round(t_incr, 3),
            "incremental_indexed": summ2["indexed"],
            "recall_p50_ms": round(statistics.median(lats), 1),
            "recall_p95_ms": round(lats[int(len(lats) * 0.95) - 1], 1),
            "recall_max_ms": round(max(lats), 1),
            "graph_export_s": round(t_graph, 3),
            "graph_nodes": len(g["nodes"]),
            "floor_met_all_queries": floor_ok,
        }
    finally:
        if created:
            shutil.rmtree(tmp, ignore_errors=True)


def _fmt(m: dict) -> str:
    return (f"{m['n']:>7} | {m['reindex_full_s']:>8.3f}s | {m['reindex_incremental_s']:>8.3f}s | "
            f"{m['recall_p50_ms']:>7.1f} | {m['recall_p95_ms']:>7.1f} | "
            f"{m['graph_export_s']:>7.3f}s | {str(m['floor_met_all_queries']):>5}")


def main(argv: list[str]) -> int:
    sizes = [int(a) for a in argv] or [1000, 5000]
    print(f"ATM scale benchmark (fts5={__import__('capabilities').has_fts5()})\n")
    print("  notes |  reindex |    incr  | p50 ms  | p95 ms  |  graph  | floor")
    print("  " + "-" * 70)
    for n in sizes:
        m = run_bench(n)
        print("  " + _fmt(m))
    print("\n(reindex=full rebuild; incr=no-change incremental; floor=human-information "
          "floor met on all queries)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
