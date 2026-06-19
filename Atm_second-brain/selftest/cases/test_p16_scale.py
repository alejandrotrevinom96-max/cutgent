"""P16 gate: the index and retrieval stay sane at scale.

Builds a synthetic vault (a few hundred notes) and asserts:
  - a full reindex indexes every note,
  - an immediate incremental reindex does ZERO work (the mtime fast-path holds at
    scale, so recall stays O(stat) not O(read+hash) per query),
  - recall returns results for every benchmark query and the human-information
    floor is met on all of them at scale,
  - recall latency is within a generous bound (guards against an O(N-per-query)
    regression sneaking back in).

This is the small, fast instance of scripts/bench.py (which runs 1k/10k/50k).

Run:  python3 selftest/cases/test_p16_scale.py
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "server"))

import bench  # noqa: E402

ok = True
N = 500
LATENCY_BUDGET_MS = 2000  # generous; real p50 at 10k is ~300ms


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    m = bench.run_bench(N)
    check(f"full reindex indexes all {N} notes", m["indexed"] == N, f"indexed={m['indexed']}")
    check("incremental reindex after no change does zero work",
          m["incremental_indexed"] == 0, f"incremental_indexed={m['incremental_indexed']}")
    check("recall p50 within latency budget", m["recall_p50_ms"] <= LATENCY_BUDGET_MS,
          f"p50={m['recall_p50_ms']}ms")
    check("recall p95 within latency budget", m["recall_p95_ms"] <= LATENCY_BUDGET_MS,
          f"p95={m['recall_p95_ms']}ms")
    check("human-information floor met on all queries at scale",
          m["floor_met_all_queries"] is True)
    check("graph_export returns the indexed nodes", m["graph_nodes"] == N,
          f"nodes={m['graph_nodes']}")

    print()
    print("P16 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌",
          f"(p50={m['recall_p50_ms']}ms, incr={m['reindex_incremental_s']}s @ {N} notes)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
