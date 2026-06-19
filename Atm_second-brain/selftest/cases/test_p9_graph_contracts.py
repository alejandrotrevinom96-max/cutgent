"""P9 gate: the app-facing graph contracts — recall.trace/1 and graph.export/1.

These power Surface C (the avatar+graph cockpit). They must be additive,
back-compatible, and honest: the trace separates query-text matches (seeds) from
1-hop graph neighbors (expanded), and never invents edges.

Run:  python3 selftest/cases/test_p9_graph_contracts.py
"""
from __future__ import annotations

import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "server"))

import recall as recall_mod  # noqa: E402
import index as index_mod  # noqa: E402

ok = True


def check(name: str, cond: bool, detail: str = "") -> None:
    global ok
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        ok = False


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        db = os.path.join(tmp, "index.db")

        # --- back-compat: without with_trace, no trace key (byte-compatible) ---
        r0 = recall_mod.recall("model proposes server disposes", k=5, db_path=db)
        check("recall without with_trace has no 'trace' key", "trace" not in r0, str(list(r0)))

        # --- recall.trace/1 ---
        r = recall_mod.recall("model proposes server disposes guardrail", k=8,
                              with_trace=True, db_path=db)
        check("trace present when requested", "trace" in r)
        tr = r.get("trace", {})
        check("trace schema is recall.trace/1", tr.get("schema") == "recall.trace/1", str(tr.get("schema")))
        for key in ("seeds", "expanded", "edges", "steps", "answer_sources"):
            check(f"trace has '{key}'", key in tr)

        result_ids = {x["id"] for x in r["results"]}
        seed_set = set(tr.get("seeds", []))
        exp_set = set(tr.get("expanded", []))
        check("seeds are query-text matches within results", seed_set and seed_set <= result_ids, str(seed_set))
        check("seeds and expanded are disjoint", not (seed_set & exp_set), str(seed_set & exp_set))
        check("expanded subset of results", exp_set <= result_ids, str(exp_set - result_ids))

        # steps ordered: all seed steps precede expand steps; nodes valid
        steps = tr.get("steps", [])
        kinds = [s["kind"] for s in steps]
        first_expand = kinds.index("expand") if "expand" in kinds else len(kinds)
        check("steps ordered: seeds before expands",
              all(k == "seed" for k in kinds[:first_expand]), str(kinds))
        # every edge referenced by an expand step indexes a real edge
        edges = tr.get("edges", [])
        edge_refs_ok = all(
            (s.get("edge") is None) or (0 <= s["edge"] < len(edges))
            for s in steps if s["kind"] == "expand"
        )
        check("expand steps reference valid edge indices", edge_refs_ok)
        # honesty: every edge connects two real notes (no invented edges)
        check("answer_sources subset of results", set(tr.get("answer_sources", [])) <= result_ids)

        # --- graph.export/1 ---
        g = index_mod.graph_export(db_path=db)
        check("graph_export schema is graph.export/1", g.get("schema") == "graph.export/1")
        nodes = g.get("nodes", [])
        edges = g.get("edges", [])
        check("graph_export returns nodes with required fields",
              nodes and all({"id", "title", "type", "tags"} <= set(n) for n in nodes),
              f"{len(nodes)} nodes")
        node_ids = {n["id"] for n in nodes}
        check("every exported edge connects two exported nodes (resolved only)",
              all(e["src"] in node_ids and e["dst"] in node_ids for e in edges),
              f"{len(edges)} edges")

    print()
    print("P9 GATE:", "ALL PASS ✅" if ok else "FAILURES ❌")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
